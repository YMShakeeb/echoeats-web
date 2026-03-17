EchoEats — Dynamic Pricing Food Waste Marketplace

A web-based market place that connects consumers to sellers of surplus food at dynamically discounted pricing to reduce food waste and save money.




Project Overview

EchoEats is a food waste reduction platform built as part of SWEN 360 / CMPE 460 — Software Design and Engineering, Spring 2026.

Vendors advertise surplus food items along with a base price and expiry time. The system automatically reduces the price over time according to configurable decay curves (linear, exponential, or stepped). Demand multiplier adjusts the price based on real-time interest. Consumers locate discounts in proximity through a map search, filter by dietary labels and reserve stock for 15 minutes.



Team Members

Yousif Shakeeb — Scrum Master, UI Design, Architecture
Mohamed Elshamy — Developer, Dual Registration, Tech Stack, Architecture
Rashid Bomtia — Developer, Dynamic Pricing Engine, Reservation System, Requirements
Ali Al Buainain — Developer, Food Listing, Photos, Wireframes, Architecture
Hussain Yusuf — Developer, Location-Based Map Search, Pricing Engine



Tech Stack

Web App — Browser-based frontend
API Gateway — Web server with load balancer
Backend Services — Login, Listing, Pricing, Location, Reservation
Primary Database — Relational database with geospatial support
Cache — In-memory caching with real-time messaging
Maps — Google Maps API
Payments — Stripe
Image Storage — Cloud image storage
Real-Time Updates — WebSocket live connection



Folder Structure

frontend — Website screens, navigation, and UI components
backend — API routes, business logic, and service coordination
database — Schema files, sample data, and location index configuration
pricing-engine — Pricing algorithm with decay curves and demand multiplier
docs — Architecture diagram, wireframes, and requirements document
tests — Unit and integration tests



Branch Structure

main — Stable production code
develop — Integration branch for completed features
feature/pricing-engine — Dynamic pricing algorithm
feature/auth — Dual registration and login system
feature/food-listing — Food item listing and photo upload
feature/maps — Location-based map search



Sprint 1 Summary

Sprint Goal: Deliver the EchoEats foundation including dual registration, food listing, dynamic pricing engine prototype, location search, and full design documentation.

Total Story Points Committed: 34 SP
Team Size: 5 members
Sprint Duration: 4 Weeks

All 8 planned tasks were completed and merged into main by end of Sprint 1.



Course Information

Course: SWEN 360 / CMPE 460 — Software Design and Engineering
Semester: Spring 2026
Institution: Academic project
