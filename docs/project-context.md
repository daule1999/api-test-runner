# Project Context - Event Management System

## 🏗️ Architecture Overview

**Frontend:** Next.js 14 (App Router) + TypeScript + TailwindCSS v4  
**Backend:** Spring Boot (Java 21) - Reactive stack using Project Reactor  
**Database:** MySQL via R2DBC (reactive driver)  
**Infrastructure:** Docker Compose with Traefik API Gateway

---

## 🎯 System Architecture Diagrams

### High-Level System Architecture

```mermaid
graph TD
    Client["🖠 Frontend (Next.js 14)"]
    Gateway["🔿 Traefik API Gateway"]
    
    subgraph Svc [Microservices Layer]
        AuthSvc["auth-service (8081) - Authentication"]
        UserSvc["user-service (8083) - User Management"]
        InventorySvc["inventory-service (8082) - Products & Stock"]
        SalesSvc["sales-service (8084) - Retail Sales & Events"]
        BillingSvc["billing-service (8085) - Invoice Generation"]
    end
    
    subgraph DB [Data Layer]
        MySQL["MySQL Database (3306)"]
    end
    
    Client --> Gateway
    Gateway --> AuthSvc
    Gateway --> UserSvc
    Gateway --> InventorySvc
    Gateway --> SalesSvc
    Gateway --> BillingSvc
    
    AuthSvc --> MySQL
    UserSvc --> MySQL
    InventorySvc --> MySQL
    SalesSvc --> MySQL
    BillingSvc --> MySQL
```

### Request Flow Architecture

```mermaid
sequenceDiagram
    title Event Management - Request Flow
    
    actor Client as Frontend (Next.js)
    participant Gateway as Traefik API Gateway
    participant SalesSvc as sales-service
    participant DB as MySQL Database
    
    Client->>Gateway: POST /api/sales-svc/events
    Gateway->>SalesSvc: Route to sales-service:8084
    SalesSvc->>DB: SELECT/INSERT into events table
    DB-->>SalesSvc: Query results
    SalesSvc-->>Gateway: JSON response
    Gateway-->>Client: HTTP 200 OK + data
```

### Service Communication Pattern

```mermaid
graph TD
    SalesSvc["sales-service"]
    InvSvc["inventory-service (product lookups)"]
    BillSvc["billing-service (invoice references)"]
    InvDB[("inventory_db")]
    BillDB[("billing_db")]
    SalesDB[("sales_db")]
    
    SalesSvc --> InvSvc
    InvSvc --> InvDB
    SalesSvc --> BillSvc
    BillSvc --> BillDB
    SalesSvc --> SalesDB
```

---

## 🎯 Database Schema Diagrams

### Complete ER Diagram

```mermaid
erDiagram
    users {
        bigint id PK
        varchar username
        varchar email
        varchar password
        timestamp createdAt
    }
    event {
        bigint id PK
        varchar eventName
        varchar eventType
        text description
        varchar location
        datetime startDate
        datetime endDate
        boolean isActive
    }
    shop {
        bigint id PK
        varchar shop_name
        bigint category_id FK
        int counter_number
        bigint event_id FK
        boolean is_active
    }
    sales_order {
        bigint id PK
        varchar order_number
        bigint shop_id FK
        bigint seller_id FK
        varchar billing_invoice_number FK
        varchar status
    }
    sales_order_item {
        bigint id PK
        bigint sales_order_id FK
        bigint product_id FK
        int quantity
    }
    shop_staff_assignment {
        bigint id PK
        bigint shop_id FK
        bigint user_id FK
        varchar role_code
    }
    
    event ||--o{ shop : hosts
    shop ||--o{ sales_order : receives
    users ||--o{ sales_order : sells
    sales_order ||--|{ sales_order_item : contains
    shop ||--o{ shop_staff_assignment : assigns
    users ||--o{ shop_staff_assignment : assigned
```

### Event-Centric Schema View

```mermaid
erDiagram
    event {
        bigint id PK
        varchar eventName
        varchar eventType
        text description
        varchar location
        datetime startDate
        datetime endDate
        boolean isActive
    }
    shop {
        bigint id PK
        varchar shop_name
        bigint category_id FK
        int counter_number
        bigint event_id FK
        boolean is_active
    }
    
    event ||--o{ shop : "hosts (event_id)"
```

---

## 🎯 API Architecture Diagrams

### Traefik Routing Layer

```mermaid
graph LR
    Traefik["Traefik Gateway (8090)"]
    Auth["auth-service (8081)"]
    User["user-service (8083)"]
    Inv["inventory-service (8082)"]
    Sales["sales-service (8084)"]
    Bill["billing-service (8085)"]
    
    Traefik -->|"/api/auth-svc/*"| Auth
    Traefik -->|"/api/users-svc/*"| User
    Traefik -->|"/api/inventory-svc/*"| Inv
    Traefik -->|"/api/sales-svc/*"| Sales
    Traefik -->|"/api/billing-svc/*"| Bill
```

### Event API Endpoints

```mermaid
graph TD
    API["Events API (/api/sales-svc/events)"]
    GET["GET (List all events)"]
    POST["POST (Create new event)"]
    PUT["PUT /[id] (Update event)"]
    DELETE["DELETE /[id] (Delete event)"]
    
    API --> GET
    API --> POST
    API --> PUT
    API --> DELETE
```

---

## 🎯 Deployment & Infrastructure Diagrams

### Docker Compose Topology

```mermaid
graph TD
    Compose["docker-compose.combined.yml"]
    Traefik["Traefik (Gateway) - 8090/8080"]
    Kong["Kong (SSL Proxy) - 8000/8443"]
    MySQL["MySQL Database - 3306"]
    AuthSvc["auth-service - 8081"]
    UserSvc["user-service - 8083"]
    InvSvc["inventory-service - 8082"]
    SalesSvc["sales-service - 8084"]
    BillSvc["billing-service - 8085"]
    
    Compose --> Traefik
    Compose --> Kong
    Compose --> MySQL
    Compose --> AuthSvc
    Compose --> UserSvc
    Compose --> InvSvc
    Compose --> SalesSvc
    Compose --> BillSvc
```

### Network Topology

```mermaid
graph TD
    Network["gateway-network (Docker)"]
    
    subgraph Ext [External Access Layer]
        Traefik["Traefik API Gateway (8090)"]
        Kong["Kong SSL Proxy (8443)"]
    end
    
    subgraph App [Application Services Layer]
        Auth["auth-service (8081)"]
        User["user-service (8083)"]
        Inv["inventory-service (8082)"]
        Sales["sales-service (8084)"]
        Bill["billing-service (8085)"]
    end
    
    subgraph Data [Data Layer]
        MySQL["MySQL Database (3306)"]
    end
    
    Network --> Ext
    Ext --> App
    App --> Data
```

---

## 🎯 Sequence Diagrams for Key Flows

### Event Creation Flow

```mermaid
sequenceDiagram
    title Event Creation Flow
    
    actor Client as Frontend User
    participant NextJS as Next.js App Router
    participant Traefik as Traefik Gateway
    participant SalesSvc as sales-service
    participant MySQL as MySQL Database
    
    Client->>NextJS: POST /api/sales-svc/events <br/> {eventName, eventType, description}
    NextJS->>Traefik: Forward to Traefik:8090
    Traefik->>SalesSvc: Route to sales-service:8084
    SalesSvc->>SalesSvc: Validate input & generate UUID
    SalesSvc->>MySQL: INSERT INTO event (id, eventName, eventType, description)
    MySQL-->>SalesSvc: Success - Row inserted
    SalesSvc-->>Traefik: Return created Event object
    Traefik-->>NextJS: HTTP 201 Created + Event data
    NextJS-->>Client: Update React state, show success
```

### Shop Assignment Flow (Multi-Service)

```mermaid
sequenceDiagram
    title Shop Staff Assignment Flow
    
    actor Client as Frontend User
    participant NextJS as Next.js App Router
    participant Traefik as Traefik Gateway
    participant SalesSvc as sales-service
    participant UserSvc as user-service
    participant MySQL as MySQL Database
    
    Client->>NextJS: POST /api/sales-svc/shops-staff/assign <br/> {shopId, userId, roleCode}
    NextJS->>Traefik: Forward to Traefik:8090
    Traefik->>SalesSvc: Route to sales-service:8084
    
    SalesSvc->>MySQL: Validate shop exists (SELECT FROM shop WHERE id = {shopId})
    MySQL-->>SalesSvc: Shop found
    
    SalesSvc->>UserSvc: Validate user exists (SELECT FROM users WHERE id = {userId})
    UserSvc-->>SalesSvc: User found
    
    SalesSvc->>MySQL: INSERT INTO shop_staff_assignment (shop_id, user_id, role_code)
    MySQL-->>SalesSvc: Success - Assignment created
    SalesSvc-->>Traefik: Return assignment object
    Traefik-->>NextJS: HTTP 201 Created + Assignment data
    NextJS-->>Client: Update UI, show confirmation
```

---

## 🎯 Database Schema Details (MySQL via R2DBC)

### Event Table
```sql
CREATE TABLE event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    description TEXT,
    location VARCHAR(255),
    start_date DATETIME,
    end_date DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Shop Table (Linked to Event)
```sql
CREATE TABLE shop (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_name VARCHAR(255) NOT NULL,
    category_id BIGINT NOT NULL,
    counter_number INT NOT NULL,
    event_id BIGINT,  -- FK → event.id
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_shop_event
        FOREIGN KEY (event_id)
        REFERENCES event(id)
        ON DELETE SET NULL
);
```

### Shop Staff Assignment Table
```sql
CREATE TABLE shop_staff_assignment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role_code VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uk_shop_role UNIQUE (shop_id, role_code),
    CONSTRAINT fk_shop FOREIGN KEY (shop_id) REFERENCES shop(id)
);
```

---

## 🎯 Backend Model Definitions (Java/Lombok)

### Event Entity (sales-service)
```java
@Table("event")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Event {
    @Id
    private Long id;
    
    private String eventName;
    private String eventType;
    private String description;
    private String location;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private Boolean isActive;
}
```

---

## 🎯 Implementation Rules & Conventions

### Frontend (Next.js)
- Strict TypeScript typing (avoid `any`)
- Use `@/*` path aliases for imports
- TailwindCSS v4 styling only
- Next.js App Router conventions
- Token-based authentication via localStorage

### Backend (Spring Boot)
- **Reactive-only:** No blocking calls anywhere in the pipeline
- Lombok annotations (`@Data`, `@Builder`, etc.) for boilerplate reduction
- WebClient injected via constructors (for testability)
- Every inter-service call needs timeouts + circuit breakers
- Zipkin distributed tracing propagation

---

## 🎯 Environment Variables

```bash
# Frontend - Next.js
NEXT_PUBLIC_API_BASE_URL=http://localhost:8090  # Browser
INTERNAL_API_BASE_URL=http://traefik:8090        # Docker server-side

# Backend - Spring Boot (each service)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d
DATABASE_URL=mysql://user:password@host:port/dbname
```

---

## 🎯 Project Structure

```bash
EventManagement/
├── app/                    # Next.js frontend (App Router)
│   ├── api/               # API proxy routes
│   │   ├── auth-svc/      # Auth service proxy
│   │   ├── users-svc/     # User service proxy  
│   │   ├── inventory-svc/  # Inventory service proxy
│   │   ├── sales-svc/       # Sales/events service proxy
│   │   └── billing-svc/    # Billing service proxy
│   ├── globals.css       # Global styles (TailwindCSS v4)
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── LoginForm/
│   ├── Header/
│   ├── LogoutButton/
│   ├── ErrorModal/
│   └── LogViewer/
├── lib/                   # Client utilities
│   ├── config.ts        # Backend API URL & endpoints
│   └── auth.ts          # Auth context, token management
├── types/                 # TypeScript interfaces
│   └── user.ts         # User/Event model definitions
├── public/                # Static assets
├── docker-compose.yml     # Infrastructure setup
├── docker-compose.db-ui.yml  # Database UI config
├── traefik/               # Traefik reverse proxy config
├── .github/
│   └── workflows/         # CI/CD pipelines
└── README.md             # Getting started guide
```

---

## 🎯 Technology Stack Summary

| Layer | Technologies |
|------|------------|
| **Frontend** | Next.js 14, React, TypeScript, TailwindCSS v4 |
| **Backend** | Spring Boot (Java 21), Project Reactor, Lombok, R2DBC |
| **Database** | MySQL with reactive driver (R2DBC) |
| **Gateway** | Traefik API Gateway + Kong SSL Proxy |
| **Infrastructure** | Docker Compose, Zipkin tracing |

---

## 🎯 Next Steps Recommendations

1. Explore specific microservices in detail (auth, user, inventory, sales, billing)
2. Review database schema and relationships
3. Understand inter-service communication patterns
4. Check Docker deployment configuration
5. Add new features or fix existing issues

---

## 🎯 Microservices Architecture

| Service | Port | Purpose |
| auth-service | 8081 | Authentication & authorization |
| user-service | 8083 | User management |
| inventory-service | 8082 | Products, categories, stock |
| sales-service | 8084 | Retail sales & events |
| billing-service | 8085 | Invoice generation |

---

## 🔐 Database Schema (MySQL via R2DBC)

### User Table
```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    createdAt TIMESTAMP DEFAULT NOW()
);
```

### Event Table
```sql
CREATE TABLE events (
    id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
    title VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    date DATE NOT NULL,
    location VARCHAR(255),
    image VARCHAR(255),
    createdBy VARCHAR(36) FOREIGN_KEY -> users.id,
    createdAt TIMESTAMP DEFAULT NOW()
);
```

### Booking Table
```sql
CREATE TABLE bookings (
    id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
    eventId VARCHAR(36) FOREIGN_KEY -> events.id,
    userId VARCHAR(36) FOREIGN_KEY -> users.id,
    quantity INTEGER,
    status ENUM('pending', 'confirmed', 'cancelled'),
    createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## 🚙️ API Documentation with Database Operations

### Authentication APIs (auth-service)

| Endpoint | Method | Database Operation |
| POST /api/auth-svc/login | Login user → JWT tokens | SELECT from users WHERE username/email matches |
| POST /api/auth-svc/register | Register new user | INSERT into users table |
| GET /api/auth-svc/validate | Validate token | Check token validity (no DB operation) |

### User APIs (user-service)

| Endpoint | Method | Database Operation |
| GET /api/user-svc/get-all-users | List all users | SELECT * from users |
| POST /api/user-svc/create-user | Create user | INSERT into users table |
| PUT /api/user-svc/update-user/{id} | Update user | UPDATE users SET WHERE id = {id} |
| DELETE /api/user-svc/delete-user/{id} | Delete user | DELETE from users WHERE id = {id} |

### Event APIs (sales-service)

| Endpoint | Method | Database Operation |
| GET /api/sales-svc/get-all-events | List all events | SELECT * from events |
| POST /api/sales-svc/create-event | Create event | INSERT into events table |
| PUT /api/sales-svc/update-event/{id} | Update event | UPDATE events SET WHERE id = {id} |
| DELETE /api/sales-svc/delete-event/{id} | Delete event | DELETE from events WHERE id = {id} |

### Inventory APIs (inventory-service)

| Endpoint | Method | Database Operation |
| GET /api/inventory-svc/get-all-products | List products | SELECT * from products |
| POST /api/inventory-svc/create-product | Create product | INSERT into products table |
| PUT /api/inventory-svc/update-product/{id} | Update product | UPDATE products SET WHERE id = {id} |
| DELETE /api/inventory-svc/delete-product/{id} | Delete product | DELETE from products WHERE id = {id} |

### Billing APIs (billing-service)

| Endpoint | Method | Database Operation |
| GET /api/billing-svc/get-all-invoices | List invoices | SELECT * from invoices |
| POST /api/billing-svc/create-invoice | Create invoice | INSERT into invoices table |
| PUT /api/billing-svc/update-invoice/{id} | Update invoice | UPDATE invoices SET WHERE id = {id} |
| DELETE /api/billing-svc/delete-invoice/{id} | Delete invoice | DELETE from invoices WHERE id = {id} |

---

## 🚙️ Implementation Rules & Conventions

### Frontend (Next.js)
- Strict TypeScript typing (avoid `any`)
- Use `@/*` path aliases for imports
- TailwindCSS v4 styling only
- Next.js App Router conventions
- Token-based authentication via localStorage

### Backend (Spring Boot)
- **Reactive-only:** No blocking calls anywhere in the pipeline
- Lombok annotations (`@Data`, `@Builder`, etc.) for boilerplate reduction
- WebClient injected via constructors (for testability)
- Every inter-service call needs timeouts + circuit breakers
- Zipkin distributed tracing propagation

---

## 📁 Project Structure

```
EventManagement/
├── app/                    # Next.js frontend
│   ├── api/               # API routes (proxy layer)
│   │   ├── auth-svc/      # Auth service proxy
│   │   ├── user-svc/      # User service proxy
│   │   ├── inventory-svc/  # Inventory service proxy
│   │   ├── sales-svc/       # Sales/events service proxy
│   │   └── billing-svc/    # Billing service proxy
│   ├── globals.css       # Global styles (TailwindCSS v4)
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── LoginForm/
│   ├── Header/
│   ├── LogoutButton/
│   ├── ErrorModal/
│   └── LogViewer/
├── lib/                   # Client utilities
│   ├── config.ts        # Backend API URL & endpoints
│   └── auth.ts          # Auth context, token management
├── public/                # Static assets
├── docker-compose.yml     # Infrastructure setup
├── docker-compose.db-ui.yml  # Database UI config
├── traefik/               # Traefik reverse proxy
├── .github/
│   └── workflows/         # CI/CD pipelines
└── README.md             # Getting started guide
```

---

## 🔐 Authentication Flow

1. **Login:** User submits credentials → backend validates → returns JWT tokens (access + refresh)
2. **Token Storage:** Frontend stores in localStorage via `useAuth()` hook
3. **Protected Routes:** Middleware checks token validity before rendering
4. **Logout:** Clears localStorage and redirects to login page

---

## 🚙️ Environment Variables

```bash
# Backend Connection
NEXT_PUBLIC_API_BASE_URL=http://localhost:5001/api
DATABASE_URL=mysql://user:password@host:port/dbname

# JWT Configuration (backend)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d
```

---

## 🎯 Key Files Summary

| File | Purpose |
| lib/auth.ts | Auth context, token management, protected routes |
| lib/config.ts | Backend API URL and endpoint mappings |
| types/user.ts | TypeScript interfaces for User/Event models |
| app/api/*/route.ts | Proxy layer forwarding to backend |
| docker-compose.yml | Docker container orchestration |

---

## 🚙️ Technology Stack

- **Frontend:** Next.js 14 (App Router), React, TailwindCSS v4
- **Backend:** Spring Boot (Java 21) - Reactive stack with Project Reactor
- **Database:** MySQL with R2DBC reactive driver
- **Authentication:** JWT tokens
- **Infrastructure:** Docker Compose + Traefik API Gateway
- **Observability:** Zipkin distributed tracing

---

## 🎯 Next Steps Recommendations

1. Explore specific microservices in detail (auth, user, inventory, sales, billing)
2. Review database schema and relationships
3. Understand inter-service communication patterns
4. Check Docker deployment configuration
5. Add new features or fix existing issues
