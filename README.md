 # 🏗️ Bunyan — Construction Management & Financial System

Bunyan is a web-based **Construction Management & Financial System** designed to help contracting companies manage their daily operations through a centralized and modern web application.

The system focuses on connecting construction sites, work tracking, approval workflows, invoices, payments, and financial reporting in one integrated platform.

The project is developed using **Google Antigravity**, with **ChatGPT** serving as an AI-assisted development partner for requirements analysis, prompt engineering, debugging, architecture discussions, code review, and technical problem solving.

## 🎯 Project Overview

Bunyan provides an integrated platform for managing:

* 📊 Dashboard & KPIs
* 👥 Customer Management
* 🏗️ Construction Sites & Project Information
* 🛠️ Work Items Library
* 📝 Work Entries & Quantity Tracking
* ✅ Work Approval & Rejection Workflows
* 🧾 Invoices & Billing
* 💰 Payments & Collections
* 🧮 VAT & Tax Invoice Calculations
* 📈 Financial Analytics & Reports
* 📑 Customer Statements & Outstanding Balances
* 🔍 Audit Logs & Activity Tracking
* ⚙️ Company Settings & Business Information
* 🌐 Arabic & English Interface Support
* 🖨️ Professional Invoice Printing & A4 Layouts
* 🔐 Authentication & Access Control

## 🛠️ Technologies & Tools

### Frontend

* React-based web application
* TypeScript / JavaScript, depending on the implemented modules
* Vite
* Modern component-based UI architecture
* Responsive layouts
* Arabic RTL & English LTR support

### Backend & Database

* Node.js
* Backend REST API
* PostgreSQL-compatible database architecture
* PGlite for the local development database environment
* Database Migrations
* Database Relationships & Data Integrity
* Server-side Validation

### Financial & Business Logic

* Work Quantity Tracking
* Approved Work-Based Billing
* Invoice Calculations
* VAT Rate Support
* Payment & Collection Tracking
* Outstanding Balance Monitoring
* Audit Trail Management

### Development & Engineering

* Google Antigravity
* ChatGPT
* Git
* GitHub
* Browser DevTools
* Automated Testing
* Build Validation

## 💡 Key Challenges & Solutions

### Work Approval & Invoice Integrity

Construction billing requires a reliable connection between completed work, approval status, and invoice generation.

Bunyan is designed to use approved work records as the basis for billing, helping prevent unapproved quantities from being invoiced.

The objective is to maintain consistency between operational records and financial transactions.

### Quantity Tracking & Duplicate Billing Prevention

Tracking completed quantities and previously billed quantities is essential in construction projects.

The system incorporates quantity and billing tracking to support accurate invoicing and reduce the risk of billing the same work more than once.

Validation and transaction integrity are important when multiple requests attempt to process the same work records.

### Invoice Calculations & VAT

Invoices must present financial information clearly and calculate totals consistently.

Bunyan includes support for VAT-related invoice calculations and tax information, with attention to invoice accuracy, readable layouts, and structured financial records.

Tax compliance requirements must be validated against the applicable regulations before production use.

### Arabic & English Invoice Layouts

Bilingual business applications introduce layout challenges involving text direction, alignment, and document readability.

Bunyan aims to provide a professional experience for Arabic and English users, including RTL/LTR alignment and invoice layouts suitable for A4 printing and PDF output.

### Audit Logging & Data Integrity

Financial and operational systems need traceability for important business activities.

Audit logging helps record relevant system events, while data integrity controls help protect relationships between customers, sites, work records, invoices, and payments.

Historical financial records should be preserved according to appropriate business rules rather than being deleted indiscriminately.

### Local Development & Persistent Storage

Local development and production hosting have different database and storage requirements.

PGlite supports the local development environment, while production deployment requires a suitable persistent database configuration, secure environment variables, and tested backup and recovery procedures.

The production architecture should be validated before moving business data to a cloud environment.

## 🧪 Testing & Validation

Testing and validation should cover the application's critical business workflows, including:

* Authentication & Login
* Customer Management
* Construction Site Management
* Work Items & Work Entries
* Work Approval & Rejection
* Quantity & Billing Validation
* Invoice Creation & Calculations
* VAT Calculations
* Payment & Collection Tracking
* Financial Reports & Dashboard Analytics
* Audit Logging
* Arabic & English UI Layouts
* Invoice Preview & A4 Printing
* Database Persistence
* Application Build & Regression Testing

Automated test results and production build status should be verified against the current codebase before each release.

## 🚀 Development & Deployment Workflow

```text
Business Analysis
        ↓
Requirements Definition
        ↓
System Architecture
        ↓
Frontend & Backend Development
        ↓
Database Integration
        ↓
Business Logic Implementation
        ↓
Testing & Debugging
        ↓
Security & Data Integrity Review
        ↓
Git & GitHub
        ↓
Cloud Deployment Preparation
        ↓
Production Deployment
```

## 🤖 AI-Assisted Development

AI-assisted development is an important part of the Bunyan engineering workflow.

**Google Antigravity** is used to support project implementation and code changes, while **ChatGPT** assists with:

* Business Requirements Analysis
* Prompt Engineering
* System Architecture Discussions
* Debugging & Error Investigation
* Code Review
* Database Design Discussions
* Financial Logic Validation
* Security Review
* Performance Optimization
* Technical Problem Solving

The goal is not simply to generate code, but to understand the business requirements, evaluate implementation decisions, test solutions, and preserve the integrity of existing functionality.

## 🔒 Security & Data Integrity

Security and data integrity are important considerations throughout the development process.

Key areas include:

* Secure Authentication & Authorization
* Environment Variable Management
* Server-Side Input Validation
* Database Integrity
* Protection of Sensitive Business Data
* Safe Git Practices
* Audit Trail Management
* Persistent Storage & Backup Planning

Production readiness requires a dedicated security review, verified access controls, and tested database backup and recovery procedures.

## 🌍 Project Vision

Bunyan aims to help contracting companies move away from fragmented spreadsheets and manual workflows toward a centralized digital system for construction operations and financial management.

By connecting work execution, approval workflows, invoicing, collections, and reporting, the platform is designed to improve operational visibility and financial control.

**Bunyan — Building smarter construction management workflows.**

## 🔗 Repository

**GitHub Repository:**

https://github.com/MohammedHamza224/Bunyan

## 💼 Portfolio

**Mohammed Hamza — Data Analytics Portfolio:**

https://vision-data-pro.lovable.app/

## 👨‍💻 Author

**Mohammed Hamza**

Data Analyst | BI Analyst | AI-Assisted Development

---

⭐ If you find this project useful or interesting, feel free to explore the repository and share your feedback.
