import { Router } from "express";
import prisma from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

const COLORS = [
  "#6366F1", // Indigo
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#EC4899", // Pink
];

router.get("/overview/:userId", authMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    // Tổng số clicks
    const totalClicks = await prisma.click.count({
      where: { link: { user_id: userId, is_deleted: false, is_active: true } },
    });

    // Số lượng links đang chạy
    const totalLinks = await prisma.link.count({
      where: { user_id: userId, is_deleted: false, is_active: true },
    });

    // Top link
    const topLink = await prisma.link.findFirst({
      where: { user_id: userId, is_deleted: false, is_active: true },
      include: { clicks: true },
      orderBy: { clicks: { _count: "desc" } },
    });

    const deviceStats = await prisma.$queryRaw<
      { device_type: string; count: number }[]
    >`
      SELECT 
        COALESCE(c.device_type, 'unknown') AS device_type,
        COUNT(*) AS count
      FROM "Click" c
      INNER JOIN "Link" l ON c.link_id = l.id
      WHERE l.user_id = ${userId}::uuid
        AND l.is_deleted = false
        AND l.is_active = true
      GROUP BY device_type
      ORDER BY count DESC;
    `;

    const last7days = await prisma.$queryRaw<
      { date: string; clicks: number }[]
    >`
      WITH days AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '6 day',
          CURRENT_DATE,
          '1 day'
        )::date AS d
      )
      SELECT
        TO_CHAR(days.d, 'DD-MM-YYYY') AS date,
        COALESCE(COUNT(c.id), 0) AS clicks
      FROM days
      LEFT JOIN "Link" l
        ON l.user_id = ${userId}::uuid
        AND l.is_deleted = false
        AND l.is_active = true
      LEFT JOIN "Click" c
        ON c.link_id = l.id
        AND (c.clicked_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.d
      GROUP BY days.d
      ORDER BY days.d ASC;
    `;

    
    const last30days = await prisma.$queryRaw<
    { date: string; clicks: number }[]
  >`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '29 day',
        CURRENT_DATE,
        '1 day'
      )::date AS d
    )
    SELECT
      TO_CHAR(days.d, 'DD-MM-YYYY') AS date,
      COALESCE(COUNT(c.id), 0) AS clicks
    FROM days
    LEFT JOIN "Link" l 
      ON l.user_id = ${userId}::uuid
      AND l.is_deleted = false
      AND l.is_active = true
    LEFT JOIN "Click" c 
      ON c.link_id = l.id
      AND (c.clicked_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.d
    GROUP BY days.d
    ORDER BY days.d ASC;
  `;



    const trafficSources = await prisma.$queryRaw<
        { referrer: string; count: number }[]
      >`
        SELECT 
          CASE
            WHEN c.referrer IS NOT NULL THEN c.referrer
          END AS referrer,
          COUNT(*) AS count
        FROM "Click" c
        INNER JOIN "Link" l ON c.link_id = l.id
        WHERE l.user_id = ${userId}::uuid
          AND l.is_deleted = false
          AND l.is_active = true
        GROUP BY referrer
        ORDER BY count DESC;
      `;

    // Lấy top 10 link có nhiều lượt click nhất
    const top10Links = await prisma.link.findMany({
      where: {
        user_id: userId,
        is_deleted: false,
        is_active: true
      },
      select: {
        id: true,
        title: true,
        original_url: true,
        short_codes: true,
        clicks: {
          select: { id: true }, // chỉ cần đếm
        },
        created_at: true
      },
      orderBy: {
        clicks: { _count: "desc" },
      },
      take: 10,
    });

    res.json({
      summary: {
        totalClicks,
        totalLinks,
      },
      device_stats: deviceStats.map((d, index) => ({
        type: d.device_type,
        color: COLORS[index % COLORS.length],
        percent:
          (Number(totalClicks) > 0
            ? (Number(d.count) / Number(totalClicks)) * 100
            : 0).toFixed(0),
      })),
      traffic_trends: trafficSources.map((source, index) => ({
        name: source.referrer,
        value: (Number(totalClicks) > 0) ? (Number(source.count) / Number(totalClicks)) * 100 : 0,
        color: COLORS[index % COLORS.length],
      })),
      trend_30days: last30days.map((d) => ({
        date: d.date,
        clicks: Number(d.clicks),
      })),
      trend: last7days.map((d) => ({
        date: d.date,
        clicks: Number(d.clicks),
      })),
      topLink: topLink
        ? {
            id: topLink.id,
            title: topLink.title,
            url: topLink.original_url,
            clicks: topLink.clicks.length,
            short_links: topLink.short_codes.map(code => `http://localhost:4000/${code}`), // đổi thành env variable trong production
          }
        : null,
      top10Links: top10Links.map((d) => ({
          title: d.title,
          clicks: d.clicks.length,
          created_at: dayjs(d.created_at).tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY"),
          ctr: totalClicks > 0 ? ((d.clicks.length / totalClicks) * 100).toFixed(0) : "0"
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analytics overview error" });
  }
});

export default router;
