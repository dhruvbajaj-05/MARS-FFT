# FFT Manufacturing Transparency Platform

## Project Goal

Build a mobile-first Manufacturing Transparency Platform for FFT that provides real-time visibility of manufacturing progress to customers while allowing FFT departments to submit production data from the factory floor.

Reference Document:
docs/FFT_Manufacturing_Platform_Requirements.docx

## Source of Truth

* The requirements document is the primary source of truth.
* Do not invent business logic.
* Do not invent fields that are not supported by requirements.
* If requirements are unclear or missing, ask questions before making assumptions.
* Every database field, API endpoint, screen and workflow must trace back to a requirement.

## User Roles

1. Admin
2. Moulding Engineer
3. Assembly Engineer
4. QC Engineer
5. Packing & Dispatch Engineer
6. Customer

## Access Rules

* Admin can view all data across all customers and departments.
* Customers can only view their own products, orders and production status.
* Customers cannot view information belonging to other customers.
* Engineers can only access their own department module.
* Engineers cannot access other department modules.

## Version 1 (MVP) Rules

This is an MVP release.

* Users can create records only.
* No editing of records.
* No deletion of records.
* Engineers only submit data.
* Customers only view data.
* Admin only views data.
* Every submission is stored as a permanent record.
* Future versions may add editing, approvals, analytics and advanced workflows.

## Application Requirements

* Mobile-first design.
* Android first, iOS support later.
* Engineers must be able to submit data directly from smartphones.
* Engineers must be able to upload images from phones.
* Role-based authentication is required.
* Secure customer data separation is mandatory.

## Development Process

Before generating code:

1. Analyze requirements document.
2. Create Software Requirements Specification (SRS).
3. Create User Role & Permission Matrix.
4. Create Workflow Diagrams.
5. Create Database Design.
6. Create System Architecture.
7. Wait for approval.

Do not generate application code until the above steps are completed and approved.
