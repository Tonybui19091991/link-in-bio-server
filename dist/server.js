"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
const links_1 = __importDefault(require("./routes/links"));
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.use("/auth", auth_1.default);
app.use("/links", links_1.default);
// Test API
app.get("/", (req, res) => {
    res.send("🚀 Server is running with Prisma + Express");
});
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
