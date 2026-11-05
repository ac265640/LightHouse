---
title: Lighthouse
emoji: 🗼
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: true
short_description: Churn prediction and causal retention planning
---

# Lighthouse

See which customers are about to leave, what each one is worth, and the offer that will actually keep them.

Built for DataNova 2026 (DN-BU-01, Customer Churn Prediction and Retention Strategy).
Source code: https://github.com/ac265640/LightHouse

The container downloads the IBM Telco Customer Churn 11.1.3 dataset and trains every model at build time,
then serves the FastAPI backend and the Next.js workspace from one origin.
