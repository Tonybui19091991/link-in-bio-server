"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
router.get("/overview/:userId", async (req, res) => {
    const { userId } = req.params;
    const userIdInt = Number(userId);
    try {
        // Tổng số clicks
        const totalClicks = await db_1.default.click.count({
            where: { link: { user_id: userIdInt } },
        });
        // Clicks hôm nay / tuần / tháng
        const todayClicks = await db_1.default.click.count({
            where: {
                link: { user_id: userIdInt },
                clicked_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        });
        const weekClicks = await db_1.default.click.count({
            where: {
                link: { user_id: userIdInt },
                clicked_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
        });
        const monthClicks = await db_1.default.click.count({
            where: {
                link: { user_id: userIdInt },
                clicked_at: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
            },
        });
        // Số lượng links đang chạy
        const totalLinks = await db_1.default.link.count({
            where: { user_id: userIdInt },
        });
        // Top link
        const topLink = await db_1.default.link.findFirst({
            where: { user_id: userIdInt },
            include: { clicks: true },
            orderBy: { clicks: { _count: "desc" } },
        });
        // Click trend 7 ngày
        const last7days = await db_1.default.$queryRaw `
      SELECT DATE(clicked_at) as date, COUNT(*) as clicks
      FROM clicks c
      INNER JOIN links l ON c.link_id = l.id
      WHERE l.user_id = ${userIdInt}
      GROUP BY DATE(clicked_at)
      ORDER BY date DESC
      LIMIT 7;
    `;
        // Traffic Source (giả sử stored trong clicks.referrer)
        const trafficSources = await db_1.default.$queryRaw `
      SELECT COALESCE(referrer, 'Direct') as referrer, COUNT(*) as count
      FROM clicks c
      INNER JOIN links l ON c.link_id = l.id
      WHERE l.user_id = ${userIdInt}
      GROUP BY referrer
      ORDER BY count DESC;
    `;
        res.json({
            summary: {
                today: todayClicks,
                week: weekClicks,
                month: monthClicks,
                total: totalClicks,
                totalLinks,
            },
            topLink: topLink
                ? {
                    id: topLink.id,
                    title: topLink.title,
                    url: topLink.original_url,
                    clicks: topLink.click.length,
                }
                : null,
            trends: last7days.reverse(), // để chart vẽ từ trái qua phải
            trafficSources,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Analytics overview error" });
    }
});
exports.default = router;
