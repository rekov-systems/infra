# POS S360T Documentation

Welcome to the POS S360T documentation. These guides cover architecture, business flows, setup, security, and more.

## Getting Started

- [Setup Guide](SETUP.md) — Install, configure, and run the project locally or in production.
- [Architecture](ARCHITECTURE.md) — High-level system architecture and technology decisions.

## Business and Data

- [Business Flows](FLOWS.md) — Sequence diagrams for POS, tables, delivery, Rappi, production, cash, AI orders, QR, and OCR.
- [Database Guide](DATABASE.md) — Schema overview, RLS, and key RPC functions.

## Deep Dives

- [Offline-First Sync](OFFLINE_SYNC.md) — How the app works without connectivity.
- [AI Agent](AI_AGENT.md) — WhatsApp conversational ordering and RAG knowledge base.
- [Hardware Integration](HARDWARE.md) — Thermal printers, cash drawers, and barcode scanners in Electron.
- [Security](SECURITY.md) — RLS, secrets, webhooks, and production checklist.

## Operations

- [Production Runbook](production-runbook.md) — Release process, quality gates, and rollback.
- [Deployments](deployments/) — Docker Compose templates for multi-tenant hosting.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.
