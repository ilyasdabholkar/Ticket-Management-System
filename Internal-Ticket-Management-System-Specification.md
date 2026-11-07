# Internal Ticket Management System
## Final Technical Specification & Implementation Plan

**Project:** Internal Ticket Management System  
**Frontend:** React + Vite + TypeScript  
**Package Manager:** Bun  
**UI Framework:** ShadCN UI + Tailwind CSS  
**Backend:** Supabase  
**Database:** PostgreSQL  
**Storage:** Supabase Storage  

---

# 1. Project Overview

Develop an internal JIRA-inspired ticket and application management system for managing development tasks, support activities, R&D work, employee efforts, and application-specific technical documentation.

The application will primarily target desktop users while maintaining a fully responsive mobile-friendly interface.

The application should provide:

- Employee and user management.
- Application management.
- Ticket creation and management.
- Kanban-based ticket tracking.
- Employee-wise effort logging.
- Ticket comments and activity history.
- PDF task and effort reports.
- Application-specific knowledge base.
- Dashboard and analytics.
- Configurable application settings.

The interface should be modern, clean, professional, and productivity-oriented, inspired by JIRA without unnecessarily replicating its complexity.

# 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Language | TypeScript |
| Runtime / Package Manager | Bun |
| UI Components | ShadCN UI |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Animations | Framer Motion |
| Routing | React Router |
| Form Management | React Hook Form |
| Validation | Zod |
| Rich Text Editor | Tiptap |
| Data Fetching | TanStack Query |
| Backend | Supabase |
| Authentication | Supabase Auth |
| Database | PostgreSQL |
| File Storage | Supabase Storage |
| PDF Generation | @react-pdf/renderer |
| Kanban Drag and Drop | dnd-kit |
| Notifications | Sonner |

Use Supabase directly for backend functionality. Avoid introducing an additional backend API unless a requirement cannot reasonably be handled using Supabase and database functions.

# 3. User Management

## 3.1 User Fields

- User ID (UUID).
- Full Name.
- Email.
- Role.
- Profile Image.
- Is Active.
- Created At.
- Updated At.

## 3.2 User Roles

Initially support two roles:

**Admin**
- Full system access.
- Manage employees.
- Manage applications.
- Create, edit, and manage all tickets.
- Manage all effort logs.
- Manage knowledge base.
- Generate reports for any employee.
- Manage application settings.
- Restore soft-deleted records.

**Employee**
- Access dashboard.
- View tickets.
- Create tickets.
- Edit permitted tickets.
- Assign tickets to themselves or other employees.
- Leave tickets unassigned.
- Add comments.
- Manage their own effort logs.
- View and search knowledge base.
- Generate reports for their own work.

## 3.3 Initial Admin

Create an initial administrator account:

- Email: ilyas.dabholkar@codewithz.in
- Role: Admin.

The initial password must be provided securely through an environment variable or a one-time provisioning process.

Do not hardcode credentials in frontend code, database migrations, or Git repositories.

Use Supabase Auth for authentication and a corresponding profiles record for user information.

# 4. Application Management

Administrators should be able to create, update, activate, deactivate, and archive applications.

## Application Fields

- Application ID.
- Application Name.
- Application Icon.
- Description.
- Is Active.
- Created At.
- Updated At.

## Application Details

Every application should have the following sections:

1. Overview.
2. Tickets.
3. Knowledge Base.
4. Reports.

Applications can have multiple tickets and knowledge base documents.

Inactive applications should not appear in new Development or Support ticket creation, but their historical tickets and documentation must remain accessible.

# 5. Ticket Management

## 5.1 Ticket Categories

Support three ticket categories:

| Category | Application Required |
|---|---|
| Development | Yes |
| Support | Yes |
| R&D | No |

R&D tickets must be allowed without an application association.

## 5.2 Ticket Identification

Generate unique ticket identifiers using category-based prefixes:

- DEV-0001
- SUP-0001
- RND-0001

Ticket numbers must be generated safely at the database level to prevent duplicate identifiers during concurrent creation.

## 5.3 Ticket Fields

- Ticket ID.
- Ticket Number.
- Title.
- Description.
- Category.
- Application ID (nullable).
- Assigned To (nullable).
- Created By.
- Priority.
- Current Status.
- Created At.
- Updated At.
- Deleted At (nullable).
- Deleted By (nullable).

Priority options:

- Low.
- Medium.
- High.
- Critical.

## 5.4 Ticket Assignment Rules

Assignment is optional.

- A ticket can be created without an assignee.
- The creator can assign it to themselves.
- The creator can assign it to another active employee.
- An administrator can change any ticket assignment.
- Employees can update permitted ticket assignments.
- Unassigned tickets must be identifiable through filters and dashboard statistics.

Store `assigned_to` as a nullable UUID referencing the employee profile.

## 5.5 Ticket Description

Use Tiptap as the rich text editor.

Supported formatting:

- Bold.
- Italic.
- Underline.
- Headings.
- Bullet lists.
- Numbered lists.
- Tables.
- Hyperlinks.
- Code blocks.
- Inline code.
- Blockquotes.
- Image insertion.
- Undo and redo.

Store the editor's structured JSON document where practical. Sanitize any HTML rendered from stored content.

## 5.6 Attachments

Use Supabase Storage.

Support:

- Images and screenshots.
- PDF.
- DOC/DOCX.
- XLS/XLSX.
- TXT.
- SQL.
- JSON.
- ZIP.

Maintain attachment metadata in PostgreSQL:

- Attachment ID.
- Ticket ID.
- Original File Name.
- Storage Path.
- File Type.
- File Size.
- Uploaded By.
- Created At.

Use private storage buckets and authenticated access.

# 6. Ticket Workflow and Kanban Board

Provide a Kanban board with four workflow columns:

1. Development.
2. In Progress.
3. QA Deployed.
4. Prod Deployed.

## Board Functionality

- Drag and drop tickets between columns.
- Filter by application.
- Filter by category.
- Filter by assigned employee.
- Filter by priority.
- Search by ticket ID and title.
- Open ticket details.
- Display ticket priority and assignee.
- Display total logged effort.
- Display recently updated tickets.

Use dnd-kit for drag-and-drop functionality.

## 6.1 Status History

Create a separate ticket status history table.

Record every status transition:

- Ticket ID.
- Previous Status.
- New Status.
- Changed By.
- Changed At (UTC).

Maintain lifecycle timestamps based on status history:

- Started On: First transition to In Progress.
- QA Deployed On: First transition to QA Deployed.
- Prod Deployed On: First transition to Prod Deployed.

These timestamps must not be overwritten when the ticket transitions again.

## 6.2 Production Locking Rule

Once a ticket reaches Prod Deployed:

- The ticket becomes locked.
- Employees cannot change its status.
- Employees cannot modify its description or other ticket details.
- Employees cannot add or remove attachments.
- Employees cannot delete it.
- Employees cannot add further comments or effort logs.

If an administrative correction is necessary, an administrator may perform a controlled correction through a dedicated privileged operation with an audit record.

Do not provide a normal reopen or backward-transition action after production deployment.

# 7. Ticket Comments and Activity History

Each ticket must have a dedicated comments section.

Comment fields:

- Comment ID.
- Ticket ID.
- User ID.
- Comment Content.
- Created At.
- Updated At.
- Deleted At (nullable).

Requirements:

- Employees can add comments to accessible tickets.
- Display author name and timestamp.
- Support rich-text formatting.
- Employees can edit and soft-delete their own comments.
- Administrators can moderate comments.
- Comments become read-only when the ticket reaches Prod Deployed.

Maintain a separate activity timeline showing:

- Ticket creation.
- Assignment changes.
- Status changes.
- Description updates.
- Priority changes.
- Attachment uploads.
- Comments.
- Effort log creation, modification, and deletion.

Activity history should be audit-oriented and should not be silently modified.

# 8. Effort Logging

Every ticket must support multiple effort entries.

## 8.1 Effort Log Fields

- Effort Log ID.
- Ticket ID.
- User ID.
- Effort Date.
- Effort Value (input value).
- Effort Unit (Minutes / Hours).
- Effort Minutes (normalized value).
- Work Description.
- Created At.
- Updated At.
- Deleted At (nullable).

## 8.2 Input Behaviour

Allow users to select:

- Date of work.
- Effort value.
- Unit: Minutes or Hours.
- Optional work description.

Examples:

| Input | Stored Effort |
|---|---:|
| 0.5 Hours | 30 minutes |
| 1 Hour | 60 minutes |
| 1.5 Hours | 90 minutes |
| 30 Minutes | 30 minutes |

Always store the normalized effort in minutes.

Use appropriate numeric validation and reject zero or negative values.

## 8.3 Effort Permissions

Employees:
- Can create their own effort logs.
- Can edit their own effort logs.
- Can soft-delete their own effort logs.
- Can view their own effort logs.

Administrators:
- Can view all effort logs.
- Can edit and soft-delete all effort logs.

Users must not be able to create, modify, or delete another employee's effort logs through direct database requests.

## 8.4 Effort Summary

Display:

- Total effort per ticket.
- Total effort per employee.
- Daily effort summary.
- Weekly effort summary.
- Monthly effort summary.
- Application-wise effort summary.

Use only non-deleted effort logs for calculations.

Effort logs cannot be created or modified after a ticket reaches Prod Deployed.

# 9. PDF Report Generation

Provide a dedicated Reports module.

## 9.1 Report Generation Filters

- Employee.
- Start Date.
- End Date.
- Include Production Details (optional).

Default employee selection should be the currently logged-in employee.

Administrators can select other employees.

## 9.2 Report Inclusion Rules

The report must support two independent inclusion criteria:

**Criterion A – Tickets Created Within Date Range**

Include tickets created between the selected start and end dates, even if no effort was logged during that period.

**Criterion B – Tickets With Effort Logged Within Date Range**

Include tickets that have at least one non-deleted effort log belonging to the selected employee within the selected date range, even if the ticket was created earlier.

Use the union of both criteria, without duplicating tickets.

For each ticket, calculate the reported effort using only non-deleted effort logs belonging to the selected employee and dated within the selected range.

A ticket included only because it was created within the range may therefore show zero effort.

## 9.3 PDF Header

The PDF must contain:

- Configurable header image.
- Employee Name.
- Employee Email.
- Selected Date Range.
- Report Title.

The header image should be configurable through application settings.

## 9.4 PDF Table

Default columns:

1. Task ID.
2. Task Title.
3. Application Name.
4. Category.
5. Efforts.
6. Current Status.
7. Started On.
8. QA Deployed On.

If Include Production Details is enabled, additionally include:

9. Production Deployment Status.
10. Prod Deployed Timestamp.

## 9.5 Report Footer

Display:

- Total effort.
- Report generation timestamp.
- Optional configurable footer text.
- Page numbers.

Format effort in readable hours and minutes.

Use a professional printable PDF layout with proper pagination and table headers.

Provide PDF preview and download functionality.

## 9.6 Report Configuration

Allow administrators to configure:

- Header image.
- Company name.
- Report title.
- Footer text.

# 10. Knowledge Base

Every application must have an independent knowledge base.

## 10.1 Content Types

Support:

**Notes**
- Rich-text notes.
- Technical references.
- SQL queries.
- API documentation.
- Troubleshooting steps.

**Uploaded Documents**
- PDF.
- DOC/DOCX.
- XLS/XLSX.
- TXT.
- SQL.
- JSON.
- Images.

## 10.2 Categories

- Requirements.
- Technical Documentation.
- Database Queries.
- API Documentation.
- Release Notes.
- KT Documents.
- Sample Inputs / Outputs.
- Troubleshooting.
- General Notes.

## 10.3 Knowledge Base Fields

- Knowledge Base ID.
- Application ID.
- Title.
- Description.
- Content.
- Document Type.
- Category.
- Search Content.
- Created By.
- Created At.
- Updated At.
- Deleted At (nullable).

Uploaded file metadata should be maintained in a separate knowledge attachments table.

## 10.4 Search

Implement search for:

- Document title.
- Description.
- Rich-text note content.
- Extracted document text.

Use PostgreSQL full-text search for searchable text.

Uploaded documents should be stored in Supabase Storage.

Document text extraction can be implemented as a separate processing capability. Do not claim full-text search inside PDFs or Word documents until extraction has been implemented.

Provide category, document type, and application filters.

# 11. Dashboard

Create a dashboard showing:

- Total tickets.
- Development tickets.
- Support tickets.
- R&D tickets.
- In Progress tickets.
- QA Deployed tickets.
- Prod Deployed tickets.
- Unassigned tickets.
- Total effort this month.
- Employee-wise effort.
- Application-wise ticket distribution.
- Recent activity.
- Recently created tickets.
- Recently updated tickets.

Provide date filters:

- Today.
- This Week.
- This Month.
- Custom Date Range.

# 12. Soft Deletion and Archival

Implement soft deletion for business records.

Applicable records:

- Tickets.
- Applications.
- Comments.
- Effort logs.
- Knowledge base records.
- Attachments, where applicable.

Use:

- `deleted_at`.
- `deleted_by`.

Requirements:

- Deleted records must be excluded from normal application views.
- Admins must be able to view deleted records.
- Admins must be able to restore eligible records.
- Preserve historical data and relationships.
- Do not permanently delete historical audit records.
- Ensure archived applications remain available for historical ticket and report references.

Permanent deletion should not be part of normal application functionality.

# 13. Database Architecture

Use Supabase PostgreSQL.

Proposed tables:

1. profiles.
2. applications.
3. tickets.
4. ticket_attachments.
5. ticket_status_history.
6. ticket_comments.
7. effort_logs.
8. knowledge_base.
9. knowledge_attachments.
10. report_settings.
11. activity_logs.

Important database rules:

- UUID primary keys.
- Foreign key constraints.
- Unique ticket numbers.
- Nullable application association for R&D.
- Required application association for Development and Support.
- Nullable assignee.
- Indexed search and filtering fields.
- UTC timestamps.
- Soft-delete fields.
- Database-level validation.
- Database functions for important state transitions.

Use migrations to create and modify database structures.

Never make manual production schema changes without corresponding migration files.

# 14. Storage Architecture

Create private Supabase Storage buckets:

- `ticket-attachments`
- `knowledge-base`
- `report-assets`

Store files in storage and references in PostgreSQL.

Use authenticated access and signed URLs.

Validate:

- File extension.
- MIME type.
- File size.
- User permissions.
- Related ticket/application ownership and accessibility.

# 15. Security Architecture

Security must be enforced at the database and storage levels, not merely through frontend conditional rendering.

Requirements:

1. Supabase Auth.
2. Role-based access control.
3. PostgreSQL Row Level Security.
4. Storage access policies.
5. Secure initial administrator provisioning.
6. Environment variable management.
7. Input validation.
8. Rich-text sanitization.
9. Secure file upload handling.
10. Audit logging.

Important restrictions:

- Never expose the Supabase service-role key in frontend code.
- Never hardcode administrator passwords.
- Do not trust user-provided role values.
- Validate employee identity through authenticated database context.
- Enforce production ticket locking at the database level.
- Enforce own-effort permissions at the database level.
- Ensure soft-deleted records cannot be accessed through ordinary user queries.

# 16. Frontend Architecture

Use feature-based architecture.

```text
src/
├── assets/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── common/
│   └── shared/
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── users/
│   ├── applications/
│   ├── tickets/
│   ├── board/
│   ├── effort-logs/
│   ├── comments/
│   ├── reports/
│   ├── knowledge-base/
│   └── settings/
├── hooks/
├── lib/
├── services/
├── types/
├── routes/
├── stores/
├── styles/
├── App.tsx
└── main.tsx

supabase/
├── migrations/
├── functions/
└── seed.sql
```

## Architecture Rules

- Keep UI components separate from business logic.
- Reuse common components.
- Avoid duplicating database queries.
- Centralize Supabase client configuration.
- Use typed database models.
- Keep feature-specific services inside their respective modules.
- Use TanStack Query for server-state management.
- Use React Hook Form and Zod for forms.
- Implement route-level authorization.
- Use reusable loading, error, and empty states.

# 17. UI/UX Requirements

Use ShadCN UI as the primary component library.

Recommended components:

| UI Requirement | Component |
|---|---|
| Main Navigation | Sidebar |
| Ticket Listing | Table |
| Ticket Creation | Dialog / Sheet |
| Rich Text | Tiptap |
| Application Selection | Combobox |
| Date Selection | Calendar / Popover |
| Status | Badge |
| Confirmation | Alert Dialog |
| Notifications | Sonner |
| Search | Command / Input |
| Loading | Skeleton |
| File Upload | Custom Dropzone |
| Filters | Dropdown Menu |
| Effort Logging | Dialog |
| Mobile Navigation | Sheet |

## Visual Guidelines

- Professional JIRA-inspired appearance.
- Clean typography.
- Consistent spacing.
- Light theme initially, with optional dark theme.
- Clear visual distinction between ticket priorities and statuses.
- Collapsible desktop sidebar.
- Responsive mobile drawer.
- Responsive ticket tables.
- Horizontal Kanban scrolling on smaller devices.
- Accessible touch targets.

## Animations

Use Framer Motion selectively:

- Page transitions.
- Dialog transitions.
- Sidebar animation.
- Kanban card movement.
- Dropdown transitions.
- Subtle hover interactions.

Loading requirements:

- Skeletons for dashboard and tables.
- Upload progress indicators.
- Button loading states.
- Toast feedback.
- Empty states.
- Error states.

Avoid unnecessary animations and excessive loading delays.

# 18. Application Settings

Provide an administration settings module for:

- Report header image.
- Company name.
- Report title.
- Report footer.
- User management.
- Application management.
- Profile settings.

Keep settings configurable rather than hardcoding report appearance into components.

# 19. Development and Implementation Roadmap

Implement the project in the following order.

## Phase 1 – Project Foundation

- Initialize React + Vite + TypeScript using Bun.
- Configure Tailwind CSS.
- Install ShadCN UI.
- Configure React Router.
- Configure Supabase client.
- Configure TanStack Query.
- Establish frontend architecture.
- Create database migration structure.
- Build the main application layout.
- Build responsive navigation.

Deliverable: Running application shell with navigation and Supabase connectivity.

## Phase 2 – Authentication and User Management

- Implement login/logout.
- Configure Supabase Auth.
- Create profiles table.
- Implement initial administrator provisioning.
- Implement employee creation and management.
- Implement roles and permissions.
- Implement RLS policies.
- Implement active/inactive users.

Deliverable: Secure authentication and user management.

## Phase 3 – Application Management

- Create applications table.
- Implement application CRUD.
- Support icon uploads.
- Implement application details page.
- Add overview, tickets, knowledge base, and reports tabs.

Deliverable: Functional application management.

## Phase 4 – Ticket Management

- Create tickets table.
- Implement category validation.
- Generate unique ticket numbers.
- Implement ticket creation and editing.
- Implement optional assignment.
- Implement rich-text editor.
- Implement attachments.
- Implement ticket listing.
- Implement filtering and searching.
- Implement ticket detail page.

Deliverable: Complete ticket CRUD functionality.

## Phase 5 – Kanban and Workflow

- Implement four workflow columns.
- Integrate dnd-kit.
- Implement drag-and-drop.
- Implement status transitions.
- Create status history.
- Record lifecycle timestamps.
- Implement production locking.
- Implement activity timeline.

Deliverable: Functional ticket workflow.

## Phase 6 – Comments and Effort Tracking

- Create ticket comments.
- Implement comment editing and deletion.
- Create effort logs.
- Implement minutes/hours conversion.
- Implement own-effort permissions.
- Implement admin effort management.
- Implement ticket effort summaries.
- Implement employee-wise summaries.

Deliverable: Complete work tracking functionality.

## Phase 7 – Knowledge Base

- Create knowledge base tables.
- Implement rich-text notes.
- Implement document uploads.
- Implement application association.
- Implement document categories.
- Implement PostgreSQL search.
- Implement document preview/download.
- Add extracted document text support as a separate capability.

Deliverable: Application-specific knowledge repository.

## Phase 8 – PDF Reporting

- Implement report filters.
- Implement employee selection.
- Implement date range.
- Implement both ticket inclusion criteria.
- Implement effort aggregation.
- Implement status history lookup.
- Implement optional production details.
- Implement configurable report header.
- Implement PDF preview and export.

Deliverable: Employee-wise PDF reporting.

## Phase 9 – Dashboard and Analytics

- Implement dashboard metrics.
- Application-wise ticket statistics.
- Employee-wise effort statistics.
- Recent activity.
- Date filters.
- Unassigned ticket statistics.

Deliverable: Complete dashboard.

## Phase 10 – Testing and Finalization

- Authentication testing.
- Role permission testing.
- RLS testing.
- Ticket creation testing.
- Concurrent ticket number generation testing.
- Status transition testing.
- Production locking testing.
- Effort calculation testing.
- Soft-delete and restoration testing.
- PDF report calculation testing.
- File upload testing.
- Knowledge base search testing.
- Responsive UI testing.
- Performance testing.

Deliverable: Tested and production-ready internal application.

# 20. Mandatory Development Rules for the AI Agent

The coding agent must follow these instructions throughout implementation.

1. Follow the approved technology stack.
2. Do not introduce unnecessary dependencies.
3. Use TypeScript throughout the frontend.
4. Use ShadCN UI components wherever appropriate.
5. Follow the feature-based folder structure.
6. Keep components reusable.
7. Avoid duplicating business logic.
8. Use Supabase migrations for schema changes.
9. Implement RLS before exposing database functionality to the frontend.
10. Never expose service-role credentials.
11. Never hardcode secrets.
12. Validate all inputs using Zod.
13. Implement proper loading, error, and empty states.
14. Preserve existing functionality when adding new features.
15. Test database permissions independently of frontend permissions.
16. Do not bypass database-level production locking.
17. Do not allow employees to manipulate other employees' effort records.
18. Use normalized effort minutes for all calculations.
19. Preserve status history and lifecycle timestamps.
20. Maintain soft-deletion and recovery functionality.
21. Do not implement features outside the agreed scope without documenting them first.
22. Update documentation when architecture or database structures change.

# 21. Definition of Done

A feature is considered complete only when:

- Its UI is implemented.
- Its database structure is implemented.
- Its security policies are implemented.
- Its validation is implemented.
- Loading and error states are implemented.
- Its business rules are enforced.
- Its relevant tests pass.
- It works on desktop and mobile.
- Its documentation is updated.

The agent must not mark a phase complete simply because its frontend screens have been created.

---

# Final Project Scope

The first production release must contain:

1. Authentication and user management.
2. Application management.
3. Ticket management.
4. Ticket categories and optional assignment.
5. Rich-text descriptions and attachments.
6. Four-stage Kanban workflow.
7. Comments and activity timeline.
8. Employee-wise effort tracking.
9. Production ticket locking.
10. Soft deletion and recovery.
11. Application-specific knowledge base.
12. Search functionality.
13. Employee-wise PDF reports.
14. Dashboard and analytics.
15. Responsive desktop and mobile interface.

**Implementation strategy:** Complete one phase at a time. Validate its database, security, business rules, and frontend before moving to the next phase. Treat this document as the authoritative project specification.