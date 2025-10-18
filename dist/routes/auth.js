"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const JWT_SECRET = "your_jwt_secret"; // đổi thành env variable trong production
// ==================== Register ====================
router.post("/register", async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ message: "Missing fields" });
    }
    try {
        const existingUser = await db_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email đã tồn tại" });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await db_1.default.user.create({
            data: { email, password_hash: hashedPassword, name },
        });
        res.status(201).json({ id: user.id, email: user.email, name: user.name });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});
// ==================== Login ====================
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }
    try {
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (!user)
            return res.status(400).json({ message: "Tài khoản không tồn tại. Vui lòng kiểm tra lại email." });
        const passwordMatch = await bcryptjs_1.default.compare(password, user.password_hash || "");
        if (!passwordMatch)
            return res.status(400).json({ message: "Mật khẩu không chính xác. Vui lòng thử lại." });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Đăng nhập thất bại. Vui lòng thử lại sau ít phút." });
    }
});
// ==================== Logout ====================
router.post("/logout", async (req, res) => {
    try {
        // Ở JWT stateless, logout = xóa token phía client
        // Server chỉ phản hồi xác nhận
        return res.status(200).json({
            success: true,
            message: "Đăng xuất thành công.",
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Đăng xuất thất bại, vui lòng thử lại.",
        });
    }
});
exports.default = router;
