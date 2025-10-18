import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PrismaClient } from "@prisma/client";

import authRoutes from "./routes/auth";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/auth", authRoutes);

// Test API
app.get("/", (req, res) => {
  res.send("🚀 Server is running with Prisma + Express");
});

// Lấy tất cả links
app.get("/links", async (req, res) => {
  const links = await prisma.link.findMany({
    include: { clicks: true, impressions: true, user: true },
  });
  res.json(links);
});

// Tạo link mới
app.post("/links", async (req, res) => {
  const { title, url, userId } = req.body;
  const link = await prisma.link.create({
    data: {
      title,
      original_url: url,
      userId,
    },
  });
  res.json(link);
});

// Lấy analytics theo link
app.get("/analytics/:id", async (req, res) => {
  const linkId = Number(req.params.id);
  const clicks = await prisma.click.count({ where: { linkId } });
  const impressions = await prisma.impression.count({ where: { linkId } });
  res.json({ linkId, clicks, impressions });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
