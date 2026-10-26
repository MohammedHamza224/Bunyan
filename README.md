 # 🏗️ Bunyan | Construction Management System

Bunyan is a web application I’m building to make day-to-day operations in contracting companies easier to manage.

The idea came from a practical business need: construction work, site records, approvals, invoices, and payments are closely connected, but managing them separately can make it difficult to keep track of progress and financial status.

Bunyan brings these activities together in one place, with a focus on work tracking, billing accuracy, and clearer financial reporting.

## 🎯 What the System Covers

The application is designed around the main workflows of a contracting business:

* 📊 **Dashboard & KPIs** — A consolidated view of operational and financial activity.
* 👥 **Customer Management** — Maintain customer records and related business information.
* 🏗️ **Site Management** — Organize construction sites and their associated work.
* 🛠️ **Work Items Library** — Maintain reusable work items for construction and maintenance activities.
* 📝 **Work Tracking** — Record completed work and quantities against specific sites.
* ✅ **Approval Workflow** — Review work entries before they are used for billing.
* 🧾 **Invoice Management** — Create and manage invoices based on business records.
* 💰 **Payments & Collections** — Track received payments and outstanding balances.
* 📈 **Financial Reports** — Review financial performance and monitor business activity.
* 📑 **Customer Statements** — Follow customer balances and transaction history.
* 🔍 **Audit Logs** — Track relevant system activities.
* ⚙️ **Company Settings** — Manage company information and invoice details.
* 🌐 **Arabic & English Support** — Support bilingual interfaces and right-to-left/left-to-right layouts.
* 🖨️ **Invoice Printing** — Provide structured invoice layouts for A4 printing and PDF output.

## 🛠️ Technology Stack

The project uses a JavaScript-based web architecture with separate frontend and backend components.

### Frontend

* React-based UI
* Vite
* TypeScript and/or JavaScript, depending on the module
* Component-based application structure

### Backend & Database

* Node.js
* REST API
* PGlite for local database development
* Database migrations and relational data management

### Development Tools

* Google Antigravity
* ChatGPT
* Git & GitHub
* Browser Developer Tools
* Automated tests and build tools

*The technology list reflects the intended project architecture and should be kept aligned with the actual dependencies and configuration in the repository.*

## 🧩 Engineering Challenges

### 1. Connecting Completed Work to Invoicing

One important part of a construction management system is making sure that recorded work and financial transactions stay connected.

Bunyan is designed around a workflow in which work is recorded against a site, reviewed, and approved before being used for billing. This helps separate work that has merely been entered from work that is ready to be invoiced.

### 2. Tracking Quantities Without Duplicate Billing

Construction work may be completed and billed in stages, so recording the total quantity alone is not always enough.

The system includes quantity and billed-quantity tracking to support more accurate billing and help prevent previously billed work from being invoiced again. Validation must also account for concurrent requests and changes to work records.

### 3. Keeping Financial Records Consistent

Invoices, payments, and outstanding balances depend on one another. A change in one area should not leave related financial information inconsistent.

This makes validation, database relationships, and reliable business rules important parts of the implementation.

### 4. Designing Invoices for Arabic and English

A bilingual invoice involves more than translating labels. Text direction, alignment, number formatting, and page layout all affect readability.

Bunyan aims to support Arabic and English invoice content, with appropriate RTL/LTR alignment and a clear layout for A4 printing.

### 5. Preserving Business History

Deleting records in a business application can have consequences when those records are linked to invoices, payments, or historical transactions.

Bunyan considers data relationships and historical records when handling business operations, with audit logging intended to improve traceability.

## 🧪 Testing & Validation

Testing is particularly important for workflows that affect financial data.

The main areas to validate include:

* Authentication and access control
* Customer and site management
* Work entry and approval workflows
* Quantity and billing validation
* Invoice totals and VAT calculations
* Payment recording and outstanding balances
* Dashboard metrics and financial reports
* Audit logging
* Arabic and English layouts
* Invoice preview and printing
* Database persistence
* Production builds and regression tests

Test coverage and results should be verified against the current repository before a release.

## 🚀 Development Workflow

The development process follows a practical cycle:

```text
Business Requirements
        ↓
System Design
        ↓
Feature Implementation
        ↓
Database & API Integration
        ↓
Testing & Debugging
        ↓
Code Review & Refinement
        ↓
Git & GitHub
        ↓
Deployment Preparation
```

## 🤖 My Experience with AI-Assisted Development

I use **Google Antigravity** as a development environment for implementing features and working through changes in the codebase.

I also use **ChatGPT** as a technical partner for:

* Breaking down business requirements
* Exploring architecture and implementation options
* Writing and refining development prompts
* Investigating errors and debugging issues
* Reviewing business logic and database relationships
* Identifying edge cases
* Improving performance and maintainability

My focus is not just on getting a feature working. It is also on understanding why a solution works, checking how it affects existing functionality, and validating the result.

This project has been an opportunity to apply AI-assisted development to a real business workflow rather than treating AI as a code-generation tool alone.

## 🔐 Security & Data Integrity

Because the application handles business and financial information, security and data integrity are important development priorities.

Areas requiring particular attention include authentication, authorization, server-side validation, environment configuration, database integrity, audit history, and backup and recovery.

Before production deployment, the application must be validated against the target hosting environment, including its database persistence and security requirements.

## 🗺️ Current Direction

The project is being developed with a focus on reliable business workflows, clearer financial visibility, and maintainable architecture.

The next stages include validating the deployment configuration, preparing persistent production database storage, and testing the application in its intended hosting environment.

## 🔗 Repository

**GitHub:**
https://github.com/MohammedHamza224/Bunyan

## 💼 Portfolio

**Mohammed Hamza — Data Analytics Portfolio:**
 https://mohammed-hamza-pro.lovable.app/

## 👨‍💻 About Me

**Mohammed Hamza**
Data Analyst | BI Analyst | AI-Assisted Development

---

*Bunyan is an ongoing project focused on connecting construction operations with financial management in a single application.*
