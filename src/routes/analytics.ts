import { Router } from "express";
import prisma from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import dotenv from 'dotenv';
dotenv.config()

const BASE_URL = process.env.BASE_URL as string;

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

const COLORS = [
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#84CC16", // Lime
  "#EAB308", // Yellow
  "#F97316", // Orange
  "#22C55E", // Green
  "#A855F7", // Purple
  "#06B6D4", // Cyan
  "#0EA5E9", // Sky
  "#F43F5E", // Rose
  "#D946EF", // Fuchsia
  "#BE123C", // Dark Red
  "#15803D", // Dark Green
  "#B45309", // Brownish Orange
  "#334155", // Slate
  "#64748B", // Grayish Blue
  "#94A3B8", // Cool Gray
  "#A3E635", // Light Lime
  "#FB923C", // Light Orange
  "#C084FC", // Light Purple
  "#FCA5A5", // Light Red
  "#4ADE80", // Light Green
  "#F9A8D4", // Light Pink
  "#34D399", // Mint
  "#2DD4BF", // Aqua
  "#FDE047", // Bright Yellow
  "#FACC15", // Golden
  "#FDA4AF", // Pastel Red
  "#C2410C", // Burnt Orange
  "#15803D", // Forest Green
];

const days = ["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ Nhật"];

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

    const clicksTodayAndYesterday = await prisma.$queryRaw<
      { date: string; clicks: bigint }[]
    >`
      WITH dates AS (
        SELECT CURRENT_DATE - INTERVAL '1 day' AS d
        UNION ALL
        SELECT CURRENT_DATE AS d
      )
      SELECT 
        TO_CHAR(dates.d, 'DD-MM-YYYY') AS date,
        COALESCE(COUNT(c.id),0) AS clicks
      FROM dates
      LEFT JOIN "Link" l
        ON l.user_id = ${userId}::uuid
        AND l.is_deleted = false
        AND l.is_active = true
      LEFT JOIN "Click" c
        ON c.link_id = l.id
        AND (c.clicked_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = dates.d
      GROUP BY dates.d
      ORDER BY dates.d ASC;
    `;

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
    
    const cityStats = await prisma.$queryRaw<
      { city: string; count: number }[]
    >`
      SELECT 
        COALESCE(c.city, 'Unknown') AS city,
        COUNT(*) AS count
      FROM "Click" c
      INNER JOIN "Link" l ON c.link_id = l.id
      WHERE l.user_id = ${userId}::uuid
        AND l.is_deleted = false
        AND l.is_active = true
      GROUP BY city
      ORDER BY count DESC;
    `;

    console.log(clicksTodayAndYesterday);
    const clicksYesterday = Number(clicksTodayAndYesterday[0].clicks);
    const clicksToday = Number(clicksTodayAndYesterday[1].clicks);

    let dailyGrowth = 0;
    if (clicksYesterday > 0) {
       dailyGrowth = ((clicksToday - clicksYesterday) / clicksYesterday) * 100;
    }

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
        short_code: true,
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

    console.log("city :", cityStats);
    res.json({
      summary: {
        totalClicks,
        totalLinks,
        dailyGrowth
      },
      city_stats: cityStats.map((d, index) => ({
        name: d.city,
        color: COLORS[index % COLORS.length],
        percent:
          (Number(totalClicks) > 0
            ? (Number(d.count) / Number(totalClicks)) * 100
            : 0),
      })),
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
            short_links: `${BASE_URL}/${topLink.short_code}`, // đổi thành env variable trong production
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

router.get("/heatmap/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Lấy clicks theo timezone VN
    const clicks = await prisma.$queryRaw<
      { clicked_at: Date }[]
    >`
      SELECT 
        (c.clicked_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') AS clicked_at
      FROM "Click" c
      JOIN "Link" l ON l.id = c.link_id
      WHERE l.user_id = ${userId}::uuid
        AND l.is_active = true
        AND l.is_deleted = false
    `;

    if (clicks.length === 0) {
      return res.json({
        days: days,
        hours: [],
        data: Array.from({ length: 7 }, () => [])
      });
    }

    const uniqueHours = Array.from(
      new Set(clicks.map(c => new Date(c.clicked_at).getHours()))
    ).sort((a, b) => a - b);

    const hourLabels = uniqueHours.map(h => `${h}h`);
    const data: number[][] = Array.from(
      { length: 7 },
      () => Array(uniqueHours.length).fill(0)
    );

    for (const { clicked_at } of clicks) {
      const d = new Date(clicked_at);
      const dayIdx = (d.getDay() + 6) % 7;
      const hourIdx = uniqueHours.indexOf(d.getHours());
      if (hourIdx >= 0) data[dayIdx][hourIdx] += 1;
    }

    const maxValue = Math.max(...data.flat());
    const normalizedData = data.map(row =>
      row.map(v => (maxValue > 0 ? v / maxValue : 0))
    );

    res.json({ days: days, hours: hourLabels, data: normalizedData });
  } catch (err) {
    console.error("❌ Heatmap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
