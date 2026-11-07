<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Restoration-AI — Water Mitigation & Mold Remediation Platform

Professional field intelligence, psychrometric monitoring, and IICRC S500 / ANSI S520 compliance platform for water damage mitigation and mold remediation teams.

## Key Capabilities

- **Adaptive 7-Phase Water Mitigation Checklist & Summary SOP Engine**:
  - Dynamically generates tailored field checklists across **Initial Inspection**, **Containment**, **Water Extraction**, **Drying**, **Dehumidification**, **Mold Prevention**, and **Final Walkthrough**.
  - Synthesizes a project-specific **Summary SOP** (Residential, Multi-Family, Commercial Office, Retail, Healthcare ICRA Class IV, Institutional, Industrial) based on Water Category (`CAT_1`–`CAT_3`), Loss Class (`CLASS_1`–`CLASS_4`), pre-1985 asbestos/lead triggers, and standing water depth.
  - Captures Client Information, Inspection Date, Lead Technician, Affected Areas, Impacted Materials, Equipment Sizing (`AHAM PPD`, Air Movers, HEPA AFDs), and dual Technician/Client digital sign-off.
- **Photo & Video Field Documentation**:
  - Multi-stage media categorization (`Before`, `During`, `After`, and specific damage categories), custom tags, captions, spatial floorplan pinning, and interactive canvas annotation.
- **AR Room Scanner & 3D Mapping**:
  - Device-locked mobile orientation workflow, LiDAR/WebXR spatial capture, moisture point plotting, and inline session cache management.
- **Automated Carrier Packet Assembly & Offline-First Sync**:
  - One-click PDF carrier packet compilation with digital signatures, psychrometric drying logs, Xactimate-ready line items, and IndexedDB/localStorage offline sync queue.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and configure your environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Start the full-stack development server (Port 3000):
   ```bash
   npm run dev
   ```
4. Run unit tests:
   ```bash
   npx vitest run
   ```
