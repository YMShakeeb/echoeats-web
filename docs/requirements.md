EchoEats — Requirements Document

Course: SWEN 360 / CMPE 460 — Software Design and Engineering
Sprint: Sprint 1
Semester: Spring 2026
Team: Yousif Shakeeb, Mohamed Elshamy, Rashid Bomtia, Ali Al Buainain, Hussain Yusuf

---

User Stories

US-01 — Vendor — Register my business with name, address, category so I can list surplus food on the platform — Must Have — 5 SP
US-02 — Consumer — Register with email, dietary preferences, location so I receive personalized food deal recommendations — Must Have — 3 SP
US-03 — Vendor — List a food item with base price, expiry time, quantity, photos so consumers can discover and buy my surplus food — Must Have — 5 SP
US-04 — Consumer — See a real-time current price that decreases over time so I can decide the best moment to buy for max savings — Must Have — 8 SP
US-05 — Consumer — Search for food near me using a map with vendor pins so I can find deals within my preferred radius — Must Have — 5 SP
US-06 — Consumer — Filter listings by dietary tags (vegan, halal, gluten-free) so I only see food matching my dietary needs — Should Have — 3 SP
US-07 — Consumer — Place a reservation with a 15-minute hold on an item so I can guarantee my item while traveling to vendor — Should Have — 5 SP
US-08 — Vendor — Set a minimum price so the system never drops below it so I maintain a revenue floor regardless of time — Should Have — 3 SP
US-09 — Consumer — Receive a push notification 1 hour before a saved item expires so I don't miss last-chance deals — Could Have — 3 SP
US-10 — Consumer — View my CO2 savings and achievement badges so I feel motivated to use EchoEats sustainably — Could Have — 3 SP

---

Functional Requirements

FR-01 — The system shall support two distinct registration flows: Vendor and Consumer, each with role-specific profile fields — High Priority
FR-02 — The system shall automatically reduce each food listing's price over time based on how long remains until expiry and how much demand exists — prices are recalculated every 15 minutes — High Priority
FR-03 — The system shall support three vendor-selectable pricing curves: linear decay, exponential decay, and stepped decay — High Priority
FR-04 — The system shall automatically update displayed prices on the consumer's screen without requiring them to reload the page — High Priority
FR-05 — The system shall allow consumers to search for food listings near their current location, showing only vendors within a chosen distance (default 5 kilometres) — High Priority
FR-06 — Food listings shall support up to 5 photos, dietary tags, allergen info, initial price, expiry datetime, and quantity — High Priority
FR-07 — The system shall implement a 15-minute time-limited hold when a consumer reserves an item, blocking double-booking — Medium Priority
FR-08 — The system shall auto-remove expired listings from search and mark them as Expired in vendor dashboards — Medium Priority

---

Non-Functional Requirements

Performance
The website must respond to 95% of requests within 200 milliseconds.
Price recalculation must complete within 30 seconds even with 10,000 active listings.
Map search results must appear within 1 second.

Security
User login sessions expire after 1 hour and require renewal every 7 days.
All passwords are securely hashed before storage.
Personal information is encrypted in the database.

Scalability
The system must support 10,000 users at the same time.
Live price updates must be delivered to up to 5,000 simultaneous users.
The architecture uses caching to ensure fast, scalable performance.

Usability
The website must meet standard accessibility guidelines.
It must work on laptops from 2020 onwards.
A consumer must be able to find, reserve, and pay for a meal in 3 taps or fewer.

---

Dynamic Pricing Algorithm

Core Formula — Current price equals the base price multiplied by a time-decay factor and a demand adjustment.
Linear Decay — Price drops at a steady, even rate from start until expiry, easy for consumers to predict.
Exponential Decay — Price stays close to original for most of the listing period, then drops sharply in the final hour to create urgency.
Stepped Decay — Price drops at set checkpoints, for example 90%, then 70%, then 50%, then 30% of the original price, very easy to understand.
Demand Multiplier — When many people are viewing an item the price drops more slowly, when interest is low it drops faster to attract buyers.
Price Floor — Vendor-set minimum, the system never drops below this value.

---

UI Screens

Home / Discovery — Default consumer view showing deals expiring soon. Includes search bar, food cards with live price and countdown timer, and filter chips.
Item Detail — Full details for a selected food listing. Includes photo, vendor name, distance, live price with decay progress bar, and Reserve/Save buttons.
Map Search — Geospatial search view with vendor pins. Includes Google Maps with clustering, vendor list below map, and radius filter.
Vendor Dashboard — Vendor-facing analytics and listing management. Includes today's stats, active listings table, and Add Listing button.
Registration — Dual-path onboarding for new users. Includes Consumer/Vendor role toggle, form fields, and dietary preference selector.
Impact / Gamification — Consumer sustainability profile page. Includes meals saved counter, CO2 saved, community rank, and achievement badges.
