# MegaShop – E-Commerce Website

A full-stack e-commerce website built as a personal project.

## Tech Stack

**Frontend**

* React.js
* Vite
* Tailwind CSS

**Backend**

* Node.js
* Express.js
* MongoDB
* Mongoose

**Other**

* JWT Authentication
* Cloudinary
* Razorpay
* Git & GitHub

## Features

* User signup and login
* JWT based authentication
* Product search, filter and sorting
* Product collections/categories
* Shopping cart
* Coupons and discounts
* Order placement and cancellation
* Cash on Delivery
* Online payment integration
* Product image upload
* Admin dashboard
* Admin product and collection management
* Order status management
* Customer management

## Project Structure

```text
mega-project/
│
├── client/          # React frontend
├── controllers/     # Backend controllers
├── models/          # MongoDB models
├── routes/          # API routes
├── services/        # Business logic
├── middlewares/     # Authentication and validation
├── config/          # Configuration
├── tests/            # Backend tests
├── index.js          # Server entry point
└── app.js            # Express app
```

## How to Run

### Backend

```bash
npm install
npm start
```

Backend runs on:

```text
http://localhost:4000
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

## Environment Variables

Create a `.env` file in the backend and add your MongoDB, JWT, Cloudinary and other required configuration values.

Do not commit `.env` files to GitHub.

## What I Learned

* Building REST APIs with Express
* Connecting a React frontend with a Node.js backend
* MongoDB database design using Mongoose
* Authentication and protected routes
* Role-based admin access
* Cart and order management
* Handling payments and product images
* Using Git and GitHub for project management

## Author

**Sipu Swain**

MCA Student
MANIT Bhopal
