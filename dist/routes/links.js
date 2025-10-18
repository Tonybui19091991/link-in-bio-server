"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const geoip_lite_1 = __importDefault(require("geoip-lite"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Tạo link rút gọn
router.post("/", auth_1.authMiddleware, async (req, res) => {
    const { user_id, original_url, title, description } = req.body;
    const shortCode = Math.random().toString(36).substring(2, 8);
    const link = await db_1.default.link.create({
        data: {
            user_id: user_id,
            original_url: original_url,
            short_code: shortCode,
            title: title,
            description: description
        },
    });
    res.json(link);
});
// Lấy danh sách link của user
router.get("/:userId", auth_1.authMiddleware, async (req, res) => {
    const links = await db_1.default.link.findMany({
        where: { user_id: req.params.userId },
    });
    const BASE_URL = "http://localhost:4000"; // đổi thành env variable trong production
    const linksWithShortLink = links.map((link) => ({
        ...link,
        short_link: `${BASE_URL}/r/${link.short_code}`,
    }));
    res.json(linksWithShortLink);
});
// Redirect link + tracking
router.get("/r/:shortCode", async (req, res) => {
    const { shortCode } = req.params;
    const userAgent = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress);
    // Tìm link trong DB
    const link = await db_1.default.link.findUnique({
        where: { short_code: shortCode },
    });
    if (!link)
        return res.status(404).json({ error: "Link not found" });
    // Detect location từ IP
    let locationData = null;
    if (ip) {
        locationData = geoip_lite_1.default.lookup(ip);
    }
    // Ghi log click
    await db_1.default.click.create({
        data: {
            link_id: link.id,
            user_agent: userAgent,
            ip_address: ip,
            clicked_at: new Date(),
            country: locationData?.country || null,
            region: locationData?.region || null,
            city: locationData?.city || null,
        },
    });
    // Redirect
    res.redirect(link.original_url);
});
exports.default = router;
