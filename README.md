# Sorapps CRM Dashboard

An enterprise-grade Customer Relationship Management (CRM) system for solar distribution companies in Nigeria, built with Next.js 16, React 19, and Tailwind CSS.

## Overview

Sorapps is a comprehensive frontend-only CRM dashboard designed specifically for managing solar energy distribution businesses. It features a complete sales lifecycle management system, financial tracking, inventory management, and detailed analytics.

## Features

### Core Modules

#### Dashboard & Analytics
- **Executive Dashboard** - KPI cards showing Today's Sales, Monthly Revenue, Outstanding Payments, and Customer Count
- **Revenue & Collections Charts** - 12-month trend visualization
- **Payment Status Tracking** - Visual representation of paid vs overdue payments
- **Top Products & Customers** - Performance rankings
- **Invoice Status Overview** - Distribution of invoices by status

#### Customer Management
- **Customer Directory** - 120+ realistic customer records with Nigerian business data
- **Advanced Filtering** - Search by name, email, phone; filter by state and business type
- **Customer Details** - Complete customer information including credit limits, purchase history, and outstanding balance
- **Contact Management** - Direct email and phone integration

#### Sales Pipeline
- **Sales Stages** - Lead → Interested → Quotation → Negotiation → Payment Pending → Paid → Delivered → Completed
- **Sales Table View** - Comprehensive sales records with filtering by pipeline stage
- **Performance Metrics** - Total sales value, profit tracking, conversion rates
- **Sales Rep Assignment** - Track which representative manages each deal

#### Product Catalog
- **500+ Products** - Organized into 10 solar product categories
- **Stock Management** - Real-time inventory levels with low-stock and out-of-stock alerts
- **Product Categories** - Solar Panels, Inverters, Batteries, Charge Controllers, and more
- **Pricing & Margins** - Cost tracking and profit margin calculations
- **Brand Support** - Multiple solar brands including SunPower, Canadian Solar, JinkoSolar

#### Invoice Management
- **Invoice Tracking** - 200+ invoice records with 6 status types
- **Collection Metrics** - Track total invoiced, collected, outstanding, and collection rates
- **Invoice Status** - Draft, Sent, Paid, Partial, Overdue, Cancelled
- **Payment Timeline** - Visual payment progress and history

#### Payment Tracking
- **Payment Collection** - Track all customer payments by method and status
- **Outstanding Payments** - Identify overdue amounts with aging information
- **Payment Methods** - Support for Bank Transfer, Cash, Cheque, and Card
- **Collection Analytics** - Total collected, average payment, and payment method breakdown

#### Reports & Analytics
- **Revenue Trend** - 12-month revenue and collection trends
- **Sales Pipeline Distribution** - Visual breakdown of deals by stage
- **Payment Status Trends** - Monthly paid vs overdue analysis
- **Inventory Value** - Stock value analysis by category
- **Top Products** - Revenue-ranked product performance
- **Top Customers** - Revenue-ranked customer performance

#### Inventory Management
- **Stock Monitoring** - Real-time stock levels with filtering options
- **Low Stock Alerts** - Automatic identification of products with less than 10 units
- **Inventory Value** - Total inventory value tracking
- **Stock Categories** - Organized by product type

#### Sales Team
- **Team Leaderboard** - Performance rankings with medals for top performers
- **Individual Metrics** - Revenue generated, deals closed, average deal size
- **Commission Tracking** - Commission rates and earning potential

#### Additional Modules
- **Deliveries** - Track delivery status and logistics
- **Warranty** - Manage product warranties and claims
- **Quotations** - Generate professional quotations
- **Calendar** - Unified event calendar (upcoming feature)
- **Settings** - Application preferences and user configuration

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4.3
- **Components**: shadcn/ui
- **Charts**: Recharts 3.10
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod
- **Tables**: TanStack React Table
- **Animations**: Framer Motion
- **State**: Zustand
- **Date Utilities**: date-fns

## Design System

### Color Scheme
- **Primary**: Deep Solar Green (#1B5E3F)
- **Accent**: Orange (#FF6B35) - representing sunlight
- **Success**: Emerald (#10b981)
- **Warning**: Amber (#f59e0b)
- **Error**: Red (#ef4444)
- **Info**: Cyan (#06b6d4)

### Typography
- **Font**: Geist (default system font stack)
- **Headings**: Bold weights for hierarchy
- **Body**: Regular 14px+ for readability

## Project Structure

```
/app
  /layout.tsx                 # Root layout with theme configuration
  /page.tsx                   # Homepage redirect to dashboard
  /(dashboard)
    /layout.tsx              # Main dashboard layout with sidebar
    /dashboard               # Executive dashboard
    /customers               # Customer management
    /sales                   # Sales pipeline
    /products                # Product catalog
    /invoices                # Invoice management
    /payments                # Payment tracking
    /inventory               # Stock management
    /reports                 # Analytics & reporting
    /quotations              # Quotation generator
    /deliveries              # Delivery tracking
    /warranty                # Warranty management
    /sales-team              # Team performance
    /calendar                # Event calendar
    /settings                # Application settings

/components
  /ui                        # shadcn/ui components
  /common                    # Shared components (KpiCard, StatusBadge, etc.)

/lib
  /api                       # Data service layer (data abstraction)
    - customers.ts
    - sales.ts
    - products.ts
    - invoices.ts
    - payments.ts
    - reports.ts
  /constants                 # Color schemes and constants
  /utils                     # Formatting and utility functions

/data
  /mockData.ts              # Comprehensive mock dataset

/styles
  /globals.css              # Tailwind configuration and theme
```

## Mock Data

The application includes realistic mock data for a Nigerian solar distribution company:

- **120 Customers** - Varied business types across Nigerian states
- **500+ Products** - 10 solar product categories with multiple brands
- **200 Sales Records** - Complete sales pipeline with various stages
- **200 Invoices** - Invoice records with different statuses
- **1000+ Transactions** - Payment history and inventory movements
- **Sales Representatives** - 5 team members with performance metrics

## Getting Started

### Installation

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

Navigate to `http://localhost:3000` to view the dashboard.

### Key Pages

- **Dashboard** - `http://localhost:3000/dashboard`
- **Customers** - `http://localhost:3000/customers`
- **Sales Pipeline** - `http://localhost:3000/sales`
- **Products** - `http://localhost:3000/products`
- **Invoices** - `http://localhost:3000/invoices`
- **Payments** - `http://localhost:3000/payments`
- **Reports** - `http://localhost:3000/reports`
- **Inventory** - `http://localhost:3000/inventory`
- **Sales Team** - `http://localhost:3000/sales-team`

## Features Implemented

✅ Complete dashboard with KPI cards and charts
✅ Customer management with advanced filtering
✅ Sales pipeline tracking across 8 stages
✅ Product catalog with inventory management
✅ Invoice and payment tracking
✅ Comprehensive reporting and analytics
✅ Sales team leaderboard
✅ Dark/Light mode support
✅ Responsive mobile design
✅ Real-time data visualization with Recharts
✅ Nigerian currency (NGN) formatting throughout

## Architecture & Patterns

### Data Abstraction Layer

All data operations go through `/lib/api/` services, making it easy to swap mock data for real API calls:

```javascript
// Current: Mock data
const customers = await getCustomers()

// Future: Easy to replace with real API
// const response = await fetch('/api/customers')
// const customers = await response.json()
```

### Service Functions

Services abstract business logic and data retrieval:

```typescript
// /lib/api/sales.ts
export async function getSalesStats() {
  // Business logic for calculating stats
}

export async function getSalesByStatus(status: string) {
  // Filtering and sorting
}
```

### Component Structure

Modular components with clear separation:

- **Pages** - Route handlers and layout logic
- **Common Components** - Reusable UI elements (KpiCard, StatusBadge)
- **Layout Components** - Sidebar, Header
- **Utility Functions** - Formatting, calculations, helpers

## Customization

### Changing Theme Colors

Edit `/app/globals.css` theme variables:

```css
:root {
  --primary: #1B5E3F;
  --accent: #FF6B35;
  --success: #10b981;
}
```

### Adding New Products/Customers

Edit `/data/mockData.ts` to adjust data generation parameters or add real data sources.

### Extending API Services

Create new service files in `/lib/api/` following the existing pattern to add new data sources.

## Production Notes

### Future Integration Points

1. **Backend Database** - Connect to real PostgreSQL/Supabase database
2. **Authentication** - Add user login and role-based access control
3. **Real API Integration** - Replace mock data with actual backend endpoints
4. **File Storage** - Add invoice PDF generation and document management
5. **Email Integration** - Send invoice reminders and notifications
6. **Payment Gateway** - Integrate payment processing
7. **Automated Reporting** - Schedule and email reports

### Performance Considerations

- Implement table virtualization for large datasets
- Add image optimization for product images
- Cache report calculations
- Lazy load dashboard charts

## Browser Support

- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

© 2024 Sorapps. All rights reserved.

---

Built with ❤️ for solar distribution businesses in Nigeria.
