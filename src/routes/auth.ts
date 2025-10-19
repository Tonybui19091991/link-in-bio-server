import { Router } from "express";
import prisma from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { authMiddleware } from "../middleware/auth";
import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;

interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
  sub: string; // ID người dùng Google
}

interface FacebookUserInfo {
  id: string;
  name: string;
  email: string;
}

// ==================== Register ====================
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (existingUser.provider_id === "") {
        return res.status(400).json({ message: "Email đã tồn tại" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      // Cập nhật mật khẩu
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { password_hash: hashedPassword },
      });

      res.status(201).json({ id: existingUser.id, email: existingUser.email, name: existingUser.name });
      
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: { email, password_hash: hashedPassword, name },
      });

      res.status(201).json({ id: user.id, email: user.email, name: user.name });
    }
  } catch (err) {
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
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "Tài khoản không tồn tại. Vui lòng kiểm tra lại email." });

    const passwordMatch = await bcrypt.compare(password, user.password_hash || "");
    if (!passwordMatch) return res.status(400).json({ message: "Mật khẩu không chính xác. Vui lòng thử lại." });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
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
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Đăng xuất thất bại, vui lòng thử lại.",
    });
  }
});

// ==================== Google OAuth Login ====================
router.post("/google", async (req, res) => {
  const { token } = req.body;

  try {
    const { access_token } = req.body;
    const { data: userInfo } = await axios.get<GoogleUserInfo>(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const email = userInfo.email;
    if (!email) {
      return res.status(400).json({ message: "Không thể lấy được địa chỉ email từ Google." });
    }

    const name = userInfo.name || "Người dùng Google";

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, password_hash: "", provider_id: userInfo.sub },
      });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, provider_id: user.provider_id } });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Đăng nhập Google thất bại." });
  }
});

// ✅ Login / Register bằng Facebook
router.post("/facebook", async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ message: "Thiếu access token từ Facebook." });
  }

  try {
    // ✅ Lấy thông tin user từ Facebook Graph API
    const fbRes = await axios.get<FacebookUserInfo>(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
    );
    const { id, email, name } = fbRes.data;

    if (!email) {
      return res.status(400).json({ message: "Không lấy được email từ tài khoản Facebook." });
    }

    // ✅ Kiểm tra user trong DB
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Nếu chưa có thì tạo mới
      user = await prisma.user.create({
        data: {
          email,
          name,
          password_hash: "", // Không dùng mật khẩu
          provider_id: id
        }
      });
    }

    // ✅ Tạo JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, provider_id: user.provider_id} });

  } catch (err) {
    res.status(500).json({ message: "Đăng nhập Facebook thất bại." });
  }
});

router.put('/update-password/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Cần mật khẩu hiện tại và mật khẩu mới' });
  }

  try {
    // Lấy user hiện tại
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    // Kiểm tra mật khẩu hiện tại
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: hashedPassword },
    });

    res.json({ message: 'Cập nhật mật khẩu thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server khi cập nhật mật khẩu' });
  }
});

export default router;
