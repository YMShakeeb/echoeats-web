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
The app must respond to 95% of requests within 200 milliseconds.
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
The app must meet standard accessibility guidelines.
It must work on iPhones from 2020 onwards and Android devices from 2019 onwards.
A consumer must be able to find, reserve, and pay for a meal in 3 taps or fewer.

---

High-Level System Architecture

Layer — Clients
Components — All operating system apps / retailer web dashboard
Technology — Application (supporting all OS) and web browser UI

Layer — API
Components — Rate limiting, SSL cancellation, load levelization, user authentication
Technology — A web server and a load balancer that handles all the requests that come in

Layer — Services
Components — Reservations, pricing, food options, login, location service and reservation service
Technology — Separate services in the back that each do one thing

Layer — Data
Components — Geospatial + Relational Database, Cache + Pub/Sub, Time-series history of prices
Technology — A main database that helps with finding locations, a database that caches information and another database that stores data over time

Layer — External API
Components — Storage, updated notifications, payments, mapping
Technology — We use Google Maps for locations, Stripe for payments, a service that sends push notifications and cloud storage for images

Layer — Real time running
Components — Updated calculations for prices forwarded to clients
Technology — A live connection that works both ways and sends price updates to users away

Layer — Background tasks
Components — The constant calculation timed every 15 mins
Technology — A scheduler that runs in the background and recalculates prices every 15 minutes automatically

---

Dynamic Pricing Algorithm

Core Formula — The price you pay is the price of the item multiplied by a few things like how much time is left and how many people want it.
Linear Decay — The price goes down at a rate from the start until it is time to stop selling the item so people can figure out what to expect.
Exponential Decay — The price of the item stays close to the original price for most of the time it is for sale then it goes down really fast in the last hour, which makes people want to buy it before it is too late.
Stepped Decay — The price goes down at times, for example it might go down to ninety percent of the original price then seventy percent, then fifty percent, then thirty percent, which is easy to understand.
Demand Multiplier — When a lot of people are looking at an item the price does not go down fast but when not many people are interested the price goes down faster to get people to buy it.
Price Floor — The person selling the item can set a price so the system will never sell the item for less than that price.

---

UI Wireframes — Main Screens

1. Home / Discovery
Description — Default consumer view showing deals that are ending.
Key Elements — Search bar, food cards with live price and countdown timer, filter chips.

2. Item Detail
Description — Full details for a chosen food listing.
Key Elements — Photo, vendor name, distance, current price with a progress bar showing how much time is left, Reserve or Save buttons.

3. Map Search
Description — Geospatial search view with vendor locations.
Key Elements — Google Maps with grouped markers, list of vendors below the map, filter by distance.

4. Vendor Dashboard
Description — Vendor-facing analytics and listing management tools.
Key Elements — Today's statistics including number of items sold and revenue earned, active listings table, Add New Listing button.

5. Registration
Description — Dual-path onboarding process for new users.
Key Elements — Choose a role either Consumer or Vendor, form fields to fill in and options to select dietary preferences.

6. Impact / Gamification
Description — Consumer sustainability profile page.
Key Elements — Number of meals saved, amount of CO2 saved, community rank and achievement badges.
