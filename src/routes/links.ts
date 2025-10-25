import { Router } from "express";
import prisma from "../db";
import geoip from "geoip-lite";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { customAlphabet } from "nanoid";
import * as dateFnsTz from "date-fns-tz";
import { UAParser } from "ua-parser-js";
import { cityTranslations } from "../cityTranslation";
import axios from "axios";

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.BASE_URL as string;
const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  const { user_id, original_url, title, description } = req.body;

  const shortAlphabet = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
  const shortCode = shortAlphabet();

  try {
    const link = await prisma.link.create({
      data: { 
        user_id, 
        original_url, 
        title, 
        description,
        short_code: shortCode,
      },
    });

    res.json(link);
  } catch (error) {
    console.error("Error creating link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Lấy danh sách link của user
router.get("/:userId", authMiddleware, async (req, res) => {
  const links = await prisma.link.findMany({
    where: { user_id: req.params.userId, is_deleted: false },
    include: {
      clicks: true,
    },
    orderBy: {
      clicks: { _count: 'desc' }, // sắp xếp theo số click
    },
  });

  const linksWithShortLinks = links.map((link) => ({
    ...link,
    short_link: `${BASE_URL}/${link.short_code}`,
    clicks_count: link.clicks.length,
  }));
  console.log(linksWithShortLinks);
  res.json(linksWithShortLinks);
});

export function translateCityName(city?: string): string | null {
  if (!city) return null;

  // Normalize: remove extra spaces, capitalize, etc.
  const normalized = city.trim();
  return cityTranslations[normalized] || normalized;
}

export function getLocation(ip: string) {
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  return {
    country: geo.country,
    region: geo.region,
    city: geo.city,
  };
}

/**
 * Xác định ứng dụng hoặc môi trường mở link (Facebook, Zalo, TikTok, Browser...)
 */
export function detectAppSource(userAgent: string = ""): string {
  const ua = userAgent.toLowerCase();

  // === App in-app browsers ===
  if (ua.includes("zalo")) return "Zalo";
  if (ua.includes("fbav") || ua.includes("fban")) return "Facebook";
  if (ua.includes("messenger")) return "Messenger";
  if (ua.includes("instagram")) return "Instagram";
  if (ua.includes("tiktok")) return "TikTok";
  if (ua.includes("twitter")) return "Twitter";
  if (ua.includes("linkedin")) return "LinkedIn";
  if (ua.includes("snapchat")) return "Snapchat";
  if (ua.includes("pinterest")) return "Pinterest";
  if (ua.includes("telegram")) return "Telegram";
  if (ua.includes("reddit")) return "Reddit";
  if (ua.includes("line")) return "Line";
  if (ua.includes("micromessenger")) return "WeChat";
  if (ua.includes("whatsapp")) return "WhatsApp";
  if (ua.includes("youtube")) return "YouTube";
  if (ua.includes("gmail")) return "Gmail";
  if (ua.includes("outlook")) return "Outlook";
  if (ua.includes("discord")) return "Discord";
  if (ua.includes("viber")) return "Viber";
  if (ua.includes("skype")) return "Skype";
  if (ua.includes("slack")) return "Slack";
  if (ua.includes("kakaotalk")) return "KakaoTalk";
  if (ua.includes("shopee")) return "Shopee";
  if (ua.includes("lazada")) return "Lazada";
  if (ua.includes("tiki")) return "Tiki";
  if (ua.includes("grab")) return "Grab";
  if (ua.includes("gojek")) return "Gojek";
  if (ua.includes("spotify")) return "Spotify";
  if (ua.includes("gsa")) return "Google App";

  // === Trình duyệt truyền thống ===
  if (ua.includes("edg")) return "Microsoft Edge";
  if (ua.includes("opr") || ua.includes("opera")) return "Opera";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("samsungbrowser")) return "Samsung Internet";
  if (ua.includes("brave")) return "Brave";
  if (ua.includes("vivaldi")) return "Vivaldi";
  if (ua.includes("duckduckgo")) return "DuckDuckGo Browser";
  if (ua.includes("yabrowser")) return "Yandex Browser";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("safari")) return "Safari";

  return "Unknown";
}

function getClientInfo(req) {
  const ua = new UAParser(req.headers["user-agent"]);
  const device = ua.getDevice();
  const os = ua.getOS();
  const browser = ua.getBrowser();

  // Xác định loại thiết bị
  const deviceType = device.type
    ? device.type.charAt(0).toUpperCase() + device.type.slice(1)
    : "Desktop";

  // Xác định tên thiết bị cụ thể
  let deviceName = "Unknown";
  if (device.vendor || device.model) {
    deviceName = [device.vendor, device.model].filter(Boolean).join(" ");
  } else if (deviceType === "Desktop") {
    if (os.name?.toLowerCase().includes("mac")) deviceName = "Mac";
    else if (os.name?.toLowerCase().includes("windows")) deviceName = "Windows PC";
    else deviceName = os.name || "Desktop";
  }

  return {
    deviceType,       // Mobile / Tablet / Desktop / etc
    deviceName,       // iPhone / iPad / Mac / Windows PC ...
    os: os.name || "Unknown",
    osVersion: os.version || "Unknown",
    browser: browser.name || "Unknown",
    browserVersion: browser.version || "Unknown",
  };
}

export const handleRedirect = async (req: any, res: any) => {
  if (
    req.method === "HEAD" ||
    req.headers["sec-purpose"]?.includes("prefetch") ||
    req.headers["sec-purpose"]?.includes("prerender")
  ) {
    return res.status(412).end();
  }

  const { shortCode } = req.params;
  const userAgent = req.headers["user-agent"] || "";
  const ipHeader = req.headers["x-forwarded-for"];
  const forwarded = req.headers['x-forwarded-for'];
  let ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress;
  
  if (ip?.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  if (ip === "::1" || ip === "127.0.0.1") {
    ip = "8.8.8.8";
  }

  const appSource = detectAppSource(userAgent);
  console.log("Nguồn mở link:", appSource);

  const link = await prisma.link.findFirst({
    where: {
      short_code: shortCode,
      is_deleted: false,
      is_active: true,
    },
  });

  if (!link) return res.status(404).json({ error: "Link không tồn tại hoặc inactive" });

  // Phân tích user agent
  const deviceInfo = getClientInfo(req);

  console.log("địa chỉ ip", ip);
  const locationData = getLocation(ip);
  console.log(locationData);
  await prisma.click.create({
    data: {
      link_id: link.id,
      user_agent: userAgent,
      device_type: deviceInfo.deviceName,
      ip_address: ip,
      referrer: appSource,
      country: locationData?.country || null,
      region: locationData?.region || null,
      city: translateCityName(locationData?.city) || null,
    },
  });

  try {
    new URL(link.original_url);
  } catch {
    return res.status(400).json({ error: "URL không hợp lệ" });
  }

  return res.redirect(link.original_url);
};

// Update link
router.put("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, original_url, description } = req.body;

    // Kiểm tra link tồn tại và thuộc user hiện tại
    const existingLink = await prisma.link.findUnique({
      where: { id: id },
    });

    if (!existingLink) {
      return res.status(404).json({ message: "Link không tồn tại" });
    }

    // Kiểm tra quyền: user_id phải trùng với user đang login
    if (existingLink.user_id !== req.userId) {
      return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa link này" });
    }

    // Update link
    const updatedLink = await prisma.link.update({
      where: { id: id },
      data: {
        title,
        original_url,
        description,
        is_active: req.body.is_active !== undefined ? req.body.is_active : existingLink.is_active,
        is_deleted: req.body.is_deleted !== undefined ? req.body.is_deleted : existingLink.is_deleted,
        updated_at: new Date(),
      },
    });

    res.json(updatedLink);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Cập nhật link thất bại" });
  }
});

export default router;

