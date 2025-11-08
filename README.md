# Panda Patches CRM

A powerful, real-time CRM built from the ground up to streamline order management, enhance team collaboration, and provide critical business insights for Panda Patches.

> **Note:** You can take a screenshot of your dashboard and replace the placeholder below to add a great visual to your project!
> ![image](https://user-images.githubusercontent.com/12345/your-screenshot-url.png)

---

## ✨ Key Features

This isn't just a basic app; it's a full-featured business tool with a professional tech stack.

*   **⚡ Real-Time Dashboards:** Separate, tailored dashboards for the CEO and Sales Agents that update instantly with new orders and status changes using Supabase real-time subscriptions.
*   **📊 Advanced Reporting:** A dedicated reports page with dynamic date-range filtering to analyze sales performance, production metrics, and agent productivity.
*   **🔒 Role-Based Access Control:** A secure system with distinct roles (Admin/CEO, Sales Agent, Production) ensuring users only see the data and actions relevant to them.
*   **🗂️ Comprehensive Order Management:** Full CRUD (Create, Read, Update, Delete) functionality for orders, including detailed views, edit history, and file attachments.
*   **🚀 Urgent Order Workflow:** A special approval flow for high-priority orders, notifying Admins/CEOs to approve or deny urgent requests.
*   **🔗 n8n Webhook Integration:** Automatically triggers external workflows for sending customer notifications (e.g., order status updates, approval links).
*   **📁 File Storage:** Seamlessly upload and manage customer attachments, design mockups, and other files using Supabase Storage.
*   **🔐 Secure Authentication:** A complete authentication system including login, sign-up, password reset, and protected routes.

---

## 🛠️ Tech Stack

*   **Frontend:** React, TypeScript
*   **Styling:** Tailwind CSS
*   **Data Fetching:** TanStack Query (React Query) for efficient caching and data synchronization.
*   **Backend & Database:** Supabase (PostgreSQL, Auth, Realtime, Storage)
*   **Routing:** React Router
*   **Charts:** Recharts

---

## 🚀 Getting Started with Vite

### Prerequisites

*   Node.js (v16 or later)
*   npm or yarn
*   An active Supabase project.
*   A Supabase project with the database schema from the Settings page applied.

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SawamuraACE/Panda-Patches-CRM-DASHBOARD.git
    cd Panda-Patches-CRM-DASHBOARD
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root of the project and add your Supabase credentials:
    ```
    VITE_SUPABASE_URL=YOUR_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```

### Available Scripts

*   `npm run dev`: Runs the app in development mode with hot-reloading.
*   `npm run build`: Builds the app for production to the `dist` folder.
*   `npm run preview`: Locally previews the production build.
*   `npm test`: Runs the test suite (requires test runner setup like Vitest).
