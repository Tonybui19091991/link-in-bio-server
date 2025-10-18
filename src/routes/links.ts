import { Router } from "express";
import prisma from "../db";
import geoip from "geoip-lite";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { customAlphabet } from "nanoid";
import * as dateFnsTz from "date-fns-tz";
import { UAParser } from "ua-parser-js";

const BASE_URL = process.env.BASE_URL as string;
const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  const { user_id, original_url, title, description } = req.body;

  const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
  let shortCodesArray = [
      "fb" + nanoid(), 
      "zalo" + nanoid(), 
      "tiktok" + nanoid(), 
      "telegram" + nanoid()
    ];

  try {
    const link = await prisma.link.create({
      data: { 
        user_id, 
        original_url, 
        title, 
        description,
        short_codes: shortCodesArray,
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
    short_links: link.short_codes.map(code => `${BASE_URL}/${code}`),
    clicks_count: link.clicks.length,
  }));
  console.log(linksWithShortLinks);
  res.json(linksWithShortLinks);
});

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
  let ip = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader || req.socket.remoteAddress;
  if (ip === "::1") ip = "8.8.8.8";

  const link = await prisma.link.findFirst({
    where: {
      short_codes: {
        has: shortCode,
      },
      is_deleted: false,
      is_active: true,
    },
  });

  if (!link) return res.status(404).json({ error: "Link không tồn tại hoặc inactive" });

  // Phân tích user agent
  const ua = new UAParser(req.headers["user-agent"]);
  const deviceType = ua.getDevice().type || "Desktop"; // mặc định là desktop

  let locationData = null;
  try {
    locationData = ip ? geoip.lookup(ip) : null;
  } catch (err) {
    console.error("GeoIP lookup failed:", err);
  }
  await prisma.click.create({
    data: {
      link_id: link.id,
      user_agent: userAgent,
      device_type: deviceType,
      ip_address: ip,
      referrer: getReferrerFromShortCode(shortCode),
      country: locationData?.country || null,
      region: locationData?.region || null,
      city: locationData?.city || null,
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

const getReferrerFromShortCode = (shortCode: string): string => {
  const code = shortCode.toLowerCase();

  if (code.includes("fb") || code.includes("facebook")) {
    return "Facebook";
  }
  if (code.includes("zalo")) {
    return "Zalo";
  }
  if (code.includes("tiktok")) {
    return "Tiktok";
  }
  if (code.includes("tele") || code.includes("telegram")) {
    return "Telegram";
  }

  return "unknown"; // fallback
};

export default router;

