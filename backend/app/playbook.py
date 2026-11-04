"""
Retention playbook: turns a customer's strongest churn drivers (SHAP) into a
concrete play an account team can run.

Why drivers and not predicted exit reasons: exit reasons in this data are not
predictable from the customer profile (≈ majority-class accuracy), so a play
keyed on a "predicted reason" would be noise. Drivers are what the model
actually uses, and each maps to a lever the business controls.
"""
from __future__ import annotations

PLAYS: dict[str, dict] = {
    "Contract lock-in": {
        "why": "Risk is driven by a short or flexible contract and low switching cost.",
        "actions": [
            "Offer a 12-month contract with a loyalty discount",
            "Bundle a free add-on for contract upgrade",
            "Time the offer 30 days before the renewal window",
        ],
        "channel": "Outbound call from retention desk",
        "kpi": "Contract upgrade rate",
        "drivers": ["contract", "tenure", "is_new_customer"],
    },
    "Value reframe": {
        "why": "Risk is driven by bill level, recent bill increases or overage charges.",
        "actions": [
            "Bill audit: right-size the plan to actual usage",
            "Swap to unlimited data to remove overage charges",
            "Personal bill-comparison email showing savings",
        ],
        "channel": "Personalised email + in-app message",
        "kpi": "ARPU retained after plan change",
        "drivers": ["monthly_charge", "charge_drift", "extra_data", "revenue_per_service",
                    "avg_monthly_revenue", "total_charges", "long_distance"],
    },
    "Service quality": {
        "why": "Risk is driven by product experience: fiber reliability, no tech support or security add-ons.",
        "actions": [
            "Free network health check / technician visit",
            "3-month trial of Premium Tech Support",
            "Router upgrade at no cost",
        ],
        "channel": "SMS with technician-scheduling link",
        "kpi": "Ticket resolution, 90-day churn",
        "drivers": ["internet_type", "premium_tech_support", "online_security",
                    "protection_services", "device_protection", "online_backup",
                    "streaming", "internet_service", "avg_monthly_gb_download"],
    },
    "Community & referral": {
        "why": "Risk is driven by weak ties: no referrals, no dependents on the account.",
        "actions": [
            "Referral reward: one month free per friend",
            "Family plan offer to add dependents",
            "Loyalty tier enrolment",
        ],
        "channel": "Email + app push",
        "kpi": "Referrals made, lines per account",
        "drivers": ["number_of_referrals", "has_referred", "referred_a_friend",
                    "number_of_dependents", "dependents", "married", "partner"],
    },
    "Payment friction": {
        "why": "Risk is driven by manual payment methods and paper billing.",
        "actions": [
            "Incentive to switch to autopay",
            "Paperless billing with e-statement reminders",
        ],
        "channel": "Email",
        "kpi": "Autopay adoption",
        "drivers": ["payment_method", "paperless_billing"],
    },
    "Lifecycle care": {
        "why": "No single lever dominates; risk comes from demographics or location.",
        "actions": [
            "Personal check-in from account manager",
            "Small loyalty thank-you reward",
        ],
        "channel": "Email",
        "kpi": "Response rate",
        "drivers": [],
    },
}

PRIORITY_GUIDE = {
    "Save now": "High risk, high value. Act within 7 days with the full play.",
    "Low-cost save": "High risk, lower value. Use automated, low-cost channels only.",
    "Grow": "Low risk, high value. Upsell and referral programmes.",
    "Maintain": "Low risk, lower value. Standard lifecycle communications.",
}


def play_name_for_drivers(top_reasons: list[dict]) -> str:
    for r in top_reasons:
        f = r["feature"]
        for name, play in PLAYS.items():
            if any(f.startswith(d) for d in play["drivers"]):
                return name
    return "Lifecycle care"


def play_for(top_reasons: list[dict], priority: str) -> dict:
    name = play_name_for_drivers(top_reasons)
    play = {k: v for k, v in PLAYS[name].items() if k != "drivers"}
    play["name"] = name
    play["priority"] = priority
    play["urgency"] = PRIORITY_GUIDE.get(priority, "")
    play["triggered_by"] = [r["label"] for r in top_reasons]
    if priority == "Low-cost save":
        play["channel"] = "Automated email / SMS"
        play["actions"] = play["actions"][:1]
    return play
