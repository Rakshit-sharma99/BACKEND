# Certirizz API Testing

## 🚀 Overview

Certirizz API is a backend service for managing users, certificates, and authentication in a certificate-issuing SaaS platform. This API provides endpoints for user management, authentication, and certificate issuance.

---

### **4️⃣ Start the Server**

#### 🔹 **Development Mode (with hot reload)**

```sh
npm run dev
```

#### 🔹 **Production Mode**

```sh
npm run build && npm start
```

### **5️⃣ Run Tests**

```sh
npm test
```

---

## 📌 Testing Example

### **🧑‍💼 User Management** (`/api/user`)

#### 🔹 **1️⃣ Create a New User**

**Endpoint:** `POST /api/user`

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Response:**

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": "2024-02-25T12:00:00Z"
}
```

---

#### 🔹 **4️⃣ Update a User**

**Endpoint:** `PUT /api/user/:id`

```json
{
  "name": "John Updated",
  "email": "john.updated@example.com"
}
```

**Response:**

```json
{
  "id": 1,
  "name": "John Updated",
  "email": "john.updated@example.com"
}
```

---

## 🔍 API Documentation

You can access API documentation via Swagger UI:

**URL:** `http://localhost:8000/api-docs`

---

## 🛠️ Development & Contribution

### **Running Linter & Code Formatting**

```sh
npm run lint
npm run format
```

### **Running Jest Tests**

```sh
npm test
```

### **Creating a New Branch for Features/Fixes**

```sh
git checkout -b feature/new-feature
```

### **Submitting a Pull Request (PR)**

1. Commit your changes with meaningful messages.
2. Push to your branch.
3. Open a PR on GitHub.

---

### **2️⃣ How do I change the server port?**

Update the `.env` file:

```sh
PORT=5000
```

Then restart the server:

```sh
npm run dev
```
