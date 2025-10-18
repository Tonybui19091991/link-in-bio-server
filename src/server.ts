import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PrismaClient } from "@prisma/client";
import dotenv from 'dotenv';
import authRoutes from "./routes/auth";
import linkRoutes, { handleRedirect } from "./routes/links";
import analyticsRoutes from "./routes/analytics";

dotenv.config();

const BASE_URL = process.env.BASE_URL as string;

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/auth", authRoutes);
app.use("/links", linkRoutes);
app.use("/analytics", analyticsRoutes);
app.get('/:shortCode', handleRedirect);

// Test API
app.get("/", (req, res) => {
  res.send("🚀 Server is running with Prisma + Express");
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${BASE_URL}`);
});
