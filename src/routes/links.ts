import { Router } from "express";
import prisma from "../db";

const router = Router();

// Tạo link rút gọn
router.post("/", async (req, res) => {
  const { userId, originalUrl, title } = req.body;
  const shortCode = Math.random().toString(36).substring(2, 8);

  const link = await prisma.link.create({
    data: { userId: userId, original_url: originalUrl, short_code: shortCode, title },
  });

  res.json(link);
});

// Lấy danh sách link của user
router.get("/:userId", async (req, res) => {
  const links = await prisma.link.findMany({
    where: { userId: req.params.userId },
  });
  res.json(links);
});

// Redirect link + tracking
router.get("/r/:shortCode", async (req, res) => {
  const { shortCode } = req.params;
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Tìm link
  const link = await prisma.links.findUnique({
    where: { short_code: shortCode },
  });

  if (!link) return res.status(404).json({ error: "Link not found" });

  // Ghi log click
  await prisma.clicks.create({
    data: {
      link_id: link.id,
      user_agent: userAgent,
      ip_address: String(ip),
      clicked_at: new Date(),
    },
  });

  // Redirect
  res.redirect(link.original_url);
});

export default router;
