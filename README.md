# 🐼 Panda Patches CRM

A comprehensive, full-stack Customer Relationship Management (CRM) application built to manage orders, customers, and internal workflows for a custom patch business. This project features a modern tech stack with a focus on role-based access, real-time data, and a high-quality user experience.

 
*(Suggestion: Replace with a real screenshot of your dashboard)*

---

## ✨ Key Features

- **Role-Based Access Control (RBAC):** Delineated permissions for `ADMIN`, `SALES`, and `PRODUCTION` roles, ensuring users only see and interact with relevant data.
- **Dynamic Order Management:** A complete lifecycle for orders from `NEW_ORDER` to `DELIVERED`, with status tracking and history logs.
- **Live Customer Insights:** The "New Order" form intelligently detects repeat customers by email or phone number, providing instant access to their history.
- **Customer 360° View:** A dedicated history page for each customer, showcasing key metrics like Lifetime Value (LTV), total orders, and a complete transaction history.
- **Automated Email Notifications:** Integrated with Supabase Edge Functions and SendGrid to automatically send transactional emails to customers and internal teams based on order status changes.
- **Secure File Management:** Secure file uploads to Supabase Storage for mockups, customer references, and production-ready files (`.DST`, `.EMB`).
- **Admin Dashboard:** Centralized control panel for User Management (create, edit, delete users) and Application Settings (dynamic logo upload).
- **Polished UI/UX:** Built with Tailwind CSS for a consistent "Panda Theme" and Framer Motion for smooth, meaningful animations.

---

## 🚀 Tech Stack

- **Frontend:**
  - **Framework:** React (with Vite)
  - **Language:** TypeScript
  - **Styling:** Tailwind CSS
  - **State Management:** TanStack Query (for server state) & React Context (for auth)
  - **Animation:** Framer Motion

- **Backend (Supabase):**
  - **Database:** PostgreSQL with Row Level Security (RLS)
  - **Authentication:** Supabase Auth
  - **Storage:** Supabase Storage for file management
  - **Serverless Functions:** Supabase Edge Functions (for email sending)

- **Email Service:**
  - **Provider:** SendGrid

---

## 🛠️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/panda-patches-crm.git
    cd panda-patches-crm
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    - Create a `.env` file in the root of the project.
    - Add your Supabase project URL and Anon Key:
      ```
      VITE_SUPABASE_URL=https://your-project-ref.supabase.co
      VITE_SUPABASE_ANON_KEY=your-public-anon-key
      ```

4.  **Set up the Database:**
    - Navigate to your Supabase project's SQL Editor.
    - Copy the entire content of `src/assets/db_schema.sql`.
    - Paste and run the script to set up all tables, views, and policies.

5.  **Start the development server:**
    ```bash
    npm run dev
    ```

---

## 部署 (Deployment)

- The frontend is deployed and hosted on **Vercel**.
- The backend, database, and authentication are managed by **Supabase**.
- **Important:** Remember to set the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables in your Vercel project settings to connect to your **LIVE** Supabase instance.