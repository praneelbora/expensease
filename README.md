![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Issues](https://img.shields.io/github/issues/praneelbora/splitfree)
![Forks](https://img.shields.io/github/forks/praneelbora/splitfree)
![Stars](https://img.shields.io/github/stars/praneelbora/splitfree)

# 🧾 SplitFree – Simplified Group Expense Tracker

**SplitFree** is being developed as a **free and open-source alternative** to expense splitting apps, with a strong focus on transparency, simplicity, and user control. I believe expense tracking shouldn't be locked behind paywalls or ads, and everyone deserves a tool they can trust and contribute to.

---

✨ **Now open for contributions** – Help improve SplitFree and shape it into the best open-source expense tracker!

---

## 📚 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Screenshots](#-screenshots)
- [Installation](#-installation)
- [Contributing](#-contributing)
- [Community & Support](#-community--support)
- [License](#-license)

---

## 🚀 Features

- ✅ Create personal and group expenses
- 📊 Real-time split calculation by **equal**, **percentage**, or **custom value**
- 🤝 Friend and group management system
- 💸 Track who owes whom and how much
- 🔄 Partial and full settlements
- 📱 Mobile first Website UI
- 📉 Category-wise expense charts and summary

---

## 🤝 Contributing

SplitFree is open to contributions from developers of all experience levels! Whether you're fixing a bug, adding a feature, or improving documentation — you're welcome.

### How to Contribute

1. Fork this repository
2. Create a new branch: `git checkout -b my-feature`
3. Make your changes and commit them: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin my-feature`
5. Open a pull request

Feel free to open [issues](https://github.com/praneebora/splitfree/issues) for bugs or feature requests.

---

## 💬 Community & Support

Have questions, feedback, or ideas?

- Create a [Discussion](https://github.com/praneebora/splitfree/discussions)
- Open an [Issue](https://github.com/praneebora/splitfree/issues)
- Reach out to me via [LinkedIn](https://www.linkedin.com/in/praneelbora/) or email: your_email@example.com

---

## 🔧 Tech Stack

### Frontend
- React + Vite.js + Tailwind CSS

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- RESTful API

### Hosting
- Frontend: Amplify
- Backend: Amazon EC2

---

## 🖼️ Screenshots

| Group Overview | Expenses Overview | My Account |
|----------------|---------------|----------------|
|![Split Free](https://github.com/user-attachments/assets/8ec34366-86d1-481e-8b82-7a234a7b4c79)| ![Split Free 2](https://github.com/user-attachments/assets/0200232d-1e11-473e-85f4-12072f8bd696) | ![IMG_2596](https://github.com/user-attachments/assets/89aeb1ca-33d2-4788-aae5-d0f998c07b20)
 |

---

## 📦 Installation

### Prerequisites
- Node.js v18+
- MongoDB running locally or on the cloud

### Frontend

```bash
git clone https://github.com/praneebora/splitfree.git
cd splitfree/website # for frontend
npm install
npm run dev
```

### Backend

```bash
cd ../server # for backend server
npm install
# Set your MongoDB URI and JWT and other secrets in .env
node bin/www
```
### 📁 `website/.env.example`

```env
# Backend API URL (switch between local/dev/prod)
VITE_BACKEND_URL=http://localhost:3000/api

# Frontend URL (used for redirects, links, CORS)
VITE_FRONTEND_URL=http://localhost:5173

# Default UPI ID for developer support (optional)
VITE_UPI_ID=yourupiid@bank

# Support/Donation Link
VITE_BUYMEACOFFEE_URL=https://www.buymeacoffee.com/praneelbora
```

### 📁 `server/.env.example`

```env
# MongoDB Connection String
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/splitfree?retryWrites=true&w=majority

# JWT Secret Key
JWT_SECRET=your_jwt_secret_key

# Nodemailer Email Configuration
NODEMAILER_USER=your_email@example.com
NODEMAILER_PASS=your_email_app_password
NODEMAILER_NAME=SplitFree App

# Frontend URL for CORS and email links
# Use production URL when deployed
FRONTEND_URL=http://localhost:5173
```

---

Built with ❤️ by [Praneel Bora](https://github.com/praneebora)  
If you find this useful, please consider giving it a ⭐️!

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE). You are free to use, modify, and distribute this project as per the terms of the license.
