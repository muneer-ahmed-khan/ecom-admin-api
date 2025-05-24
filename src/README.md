# E-commerce Admin API (Node.js + Express + PostgreSQL)

This repository contains a **RESTful API** built with Node.js, Express.js, and PostgreSQL. It powers an e-commerce admin dashboard, providing endpoints for:

* **Sales status**: retrieve raw sales, filter by date/product/category, aggregate revenue by daily/weekly/monthly/yearly, compare revenue across date ranges.
* **Inventory management**: view current stock levels, filter low-stock products, update inventory quantities, and track historical changes.
* **Product management**: register new products (with categories and initial inventory), update product details, and delete products.
* **Category management**: create, update, and delete product categories.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Getting Started](#getting-started)

   1. [Prerequisites](#prerequisites)
   2. [Clone & Install](#clone--install)
   3. [Configure Environment Variables](#configure-environment-variables)
   4. [Database Setup](#database-setup)
   5. [Seed Demo Data](#seed-demo-data)
   6. [Run the Server](#run-the-server)
3. [API Endpoints](#api-endpoints)

   1. [Categories](#categories)
   2. [Products](#products)
   3. [Sales](#sales)
   4. [Inventory](#inventory)
4. [Database Schema](#database-schema)
5. [License](#license)

---

## Tech Stack

* **Node.js** (v14+)
* **Express.js** (v4+)
* **PostgreSQL** (v12+)
* **pg** (Node.js PostgreSQL client)
* **dotenv** (environment variables)
* **nodemon** (dev only)

---

## Getting Started

### Prerequisites

* **Node.js** (Check with `node --version`; v14 or above is recommended)
* **npm** (Comes bundled with Node.js; check `npm --version`)
* **PostgreSQL** (Check with `psql --version`)

### Clone & Install

1. Clone this repository:

   ```bash
   git clone https://github.com/<your-username>/ecom-admin-api.git
   cd ecom-admin-api
   ```
2. Install Node dependencies:

   ```bash
   npm install
   ```

### Configure Environment Variables

In the project root, create a file named `.env`:

```bash
touch .env
```

Add the following (modify to match your local PostgreSQL setup):

```ini
# PostgreSQL connection settings
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_postgres_password
PGDATABASE=ecom_admin_db

# Application port
PORT=3000
```

### Database Setup

Start PostgreSQL if not already running.

Create the database and run migrations (schema):

```bash
# If your default Postgres user is "postgres"
psql -U postgres -c "CREATE DATABASE ecom_admin_db;"
psql -U postgres -d ecom_admin_db -f src/db/schema.sql
```

This will create the tables:

* `categories`
* `products`
* `inventory`
* `inventory_history`
* `sales`

(Optional) Verify tables via psql:

```sql
\c ecom_admin_db
\dt
```

### Seed Demo Data

**Note:** This step populates sample categories, products, inventory levels, sales for the last 60 days, and inventory history.

```bash
node src/seed/seed.js
```

You should see:

```yaml
Cleared old data.
Inserted categories: { Electronics: 1, Books: 2, Clothing: 3, Home: 4, Sports: 5 }
Inserted 50 products.
Inventory initial quantities inserted.
Random sales and inventory history seeded.
Seeding completed successfully.
```

### Run the Server

**Development** (auto-restart on file changes):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

The server will listen on `http://localhost:3000/`. A simple health check:

```http
GET http://localhost:3000/

Response:
{ "message": "E-commerce Admin API is running." }
```

---

## API Endpoints

All routes are prefixed with `/api`. Below is a quick reference. Example requests assume `localhost:3000`.

### Categories

**GET** `/api/categories`
: Retrieves all categories.

**POST** `/api/categories`
: Create a new category.

Request body (JSON):

```json
{ "name": "Garden" }
```

**Responses:**

* `201 Created` with the new category object.
* `409 Conflict` if a category with that name already exists.

**PUT** `/api/categories/:id`
: Update a category’s name.

Request body (JSON):

```json
{ "name": "New Category Name" }
```

**Responses:**

* `200 OK` with updated category object.
* `404 Not Found` if no such category.
* `409 Conflict` if new name duplicates an existing category.

**DELETE** `/api/categories/:id`
: Deletes a category if no products reference it.

**Responses:**

* `200 OK` with success message.
* `409 Conflict` if one or more products still use this category.
* `404 Not Found` if category doesn’t exist.

### Products

**GET** `/api/products`
: Retrieves all products (with category name and current inventory).

Optional query: `?category_id=<id>`

**Response:**

```json
[
  {
    "id": 1,
    "name": "Electronics Item 1",
    "description": "…",
    "price": 123.45,
    "category_id": 1,
    "category_name": "Electronics",
    "quantity": 76
  },
  …
]
```

**GET** `/api/products/:id`
: Retrieves one product by ID.

* `200 OK`: product object.
* `404 Not Found`: `{ "error": "Product not found." }`

**POST** `/api/products`
: Create/register a new product.

Request body (JSON):

```json
{
  "name": "Garden Tool X",
  "description": "A handy spade for your garden",
  "price": 25.99,
  "category_id": 4,
  "initial_quantity": 50
}
```

Server will:

1. Insert into `products`.
2. Insert into `inventory` (with `quantity = initial_quantity`).
3. Insert into `inventory_history` (recording initial stock).

**Response:** `201 Created` with the new product (including `category_name` and `quantity`).

**PUT** `/api/products/:id`
: Update an existing product.

Request body can include any subset of:

```json
{ "name": "...", "description": "...", "price": 19.99, "category_id": 2 }
```

**Responses:**

* `200 OK` with updated product (including `category_name` and `quantity`).
* `400 Bad Request` for no valid fields or invalid values.
* `404 Not Found` if product not found.

**DELETE** `/api/products/:id`
: Deletes a product only if no sales reference it. Also deletes its inventory and history.

**Responses:**

* `200 OK`: `{ "message": "Deleted product: Garden Tool X" }`
* `409 Conflict` if sales exist for that product.
* `404 Not Found` if product not found.

### Sales

**GET** `/api/sales`
: Retrieves raw sales records, joined with product & category info.

Query parameters (all optional):

* `startDate=YYYY-MM-DD`
* `endDate=YYYY-MM-DD`
* `product_id=<integer>`
* `category_id=<integer>`

**Example:**

```http
GET /api/sales?startDate=2025-04-01&endDate=2025-04-30
```

**Response:**

```json
[
  {
    "id": 123,
    "product_id": 5,
    "product_name": "Books Item 3",
    "category_id": 2,
    "category_name": "Books",
    "quantity": 2,
    "total_price": "39.98",
    "sale_date": "2025-04-15T10:30:00.000Z"
  },
  …
]
```

**GET** `/api/sales/aggregate`
: Aggregate revenue and quantity by time period.

Query parameters:

* `period` (required): `daily` | `weekly` | `monthly` | `yearly`
* `startDate=YYYY-MM-DD` (optional)
* `endDate=YYYY-MM-DD` (optional)
* `category_id=<integer>` (optional)
* `product_id=<integer>` (optional)

**Example:**

```http
GET /api/sales/aggregate?period=monthly&startDate=2025-01-01&endDate=2025-12-31
```
