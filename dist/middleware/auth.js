"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = "your_jwt_secret"; // production: lưu trong env
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ message: "Missing token" });
    const token = authHeader.split(" ")[1];
    if (!token)
        return res.status(401).json({ message: "Invalid token" });
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    }
    catch (err) {
        res.status(401).json({ message: "Invalid token" });
    }
};
exports.authMiddleware = authMiddleware;
