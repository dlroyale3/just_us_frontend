# Just Us - Frontend Architecture & UI/UX Blueprint
**Tech Stack:** React, Vite, React Router, Tailwind CSS (recommended for styling).

## The Core Concept
"Just Us" is a highly secure, private, 1-on-1 digital vault for couples. It features scheduled messages (Time Capsules) and real-time chat. Because of the intimate nature of the app, the UI must scream **Privacy, Security, and Premium Quality**. 

## UI/UX Design Principles
* **The Vibe:** A "Private Vault". It shouldn't feel like a noisy social media app. It should feel like a premium, exclusive club or a secure Scandinavian bank. 
* **Colors:** Deep, rich, and calming dark tones (e.g., Midnight Slate/Navy) paired with soft, warm accents (Champagne Gold or Terracotta). If using light mode, use warm ivory/off-white, not harsh hospital white.
* **Typography:** Clean and modern. Use fonts like 'Inter' or 'Outfit' for UI elements, maybe paired with an elegant serif for main headings to add a touch of luxury.
* **Geometry:** High use of whitespace (let elements breathe). Use generously rounded corners (`rounded-2xl` or `rounded-full`) for buttons and cards to make the interface feel organic and welcoming, not sharp and corporate.
* **Routing Logic (The 3 States):** The app must intelligently route the user based on their state fetched from the `/me` API endpoint:
    1. No Token / Expired Token -> `Logged Out` State (Landing Page)
    2. Token valid, `has_partner: false` -> `Unpaired` State (Pairing Page)
    3. Token valid, `has_partner: true` -> `Paired` State (Main Dashboard - Future Chapter)

---

## CHAPTER 1: The Landing Page (Logged Out State)
**Goal:** Convert visitors into users. Since the app is completely locked behind authentication, this page must "sell" the value of the app before asking for login.

**Layout & Components:**
1.  **Hero Section (Top):**
    * *Visuals:* Centered layout, massive breathing room (whitespace).
    * *Text:* An emotional, clear headline (e.g., "A digital corner just for the two of you.") and a descriptive subheadline explaining the "Time Capsules" and private chat.
    * *Action:* A prominent, premium-looking "Sign in with Google" button. It should feature the official Google logo and a subtle shadow. No other login options are needed.
2.  **How It Works Section (Middle):**
    * *Visuals:* A clean 3-column grid (on desktop) or a vertical stack (on mobile).
    * *Content:* Step 1: Secure Login. Step 2: Pair with your partner via a secret code. Step 3: Start burying time capsules.
3.  **Privacy Guarantee (Bottom):**
    * A small, elegant section reassuring the user: "Zero ads. Zero algorithms. End-to-end peace of mind."

---

## CHAPTER 2: The Pairing System (Unpaired State)
**Goal:** Connect two users. A user cannot navigate anywhere else in the app until this step is completed.

**Layout & Components:**
* *Responsive Design Rule:* Use a split-screen (2 columns) for Desktop, but strictly stack them vertically for Mobile (which will be the primary use case).
* **Left Side / Top (My Code):**
    * A card displaying the current user's unique invite code (fetched from the `/me` endpoint).
    * A "Copy Link" or "Copy Code" button for easy sharing. (UX bonus: clicking it should show a temporary "Copied!" tooltip).
* **Right Side / Bottom (Partner's Code):**
    * A visual separator (e.g., a subtle line with the word "OR").
    * An input field asking "Enter your partner's code".
    * A submit button ("Accept Invite"). 
    * *State Handling:* Must gracefully display loading states and API error messages (e.g., "Code invalid" or "Already paired") below the input.