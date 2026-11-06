# Methodology

How Lighthouse turns a customer table into a retention plan, and the evidence behind each decision. Every number here comes from [`artifacts/report.json`](../artifacts/report.json), written by `python -m ml.retention.pipeline`.

## 1. Data

**IBM Telco Customer Churn 11.1.3 (extended)**: 7,043 customers of a California telecom at the end of one quarter, with 52 columns covering demographics, location, services, billing, the retention offer each customer received, satisfaction, lifetime-value estimates and, for churners, the reason they gave. 26.5% of customers left during the quarter.

The data has no time series: it is one snapshot. That fact shapes the survival model (section 5).

## 2. Leakage audit

Before any training, each column is scored on its own against the churn label.

| Column | Single-feature AUC | Why it leaks |
|---|---|---|
| `churn_reason` | 1.000 | Only recorded for customers who left |
| `churn_category` | 1.000 | Only recorded for customers who left |
| `customer_status` | 1.000 | Is the label |
| `satisfaction_score` | 0.950 | Survey taken after the outcome |
| `churn_score` | 0.943 | The vendor's own model output |
| `cltv` | 0.581 | The vendor's estimate, replaced by our own CLV |

A model trained with these columns reaches **0.998 AUC**: impressive in a notebook and useless on day one. All six are excluded, and a test fails the build if one returns.

**Protected attribute.** Gender is excluded from the features. An ablation shows it adds almost nothing (AUC 0.9217 with it, 0.9204 without), so it is kept only for the fairness audit.

**Engineered features.** Ten features are added, among them:
- number of services held
- protection services
- average monthly revenue
- charge drift (current bill against lifetime average)
- refund ratio
- extra-data ratio
- a new-customer flag
- a referral flag
- revenue per service
- contract length in months

## 3. Who will leave

**Split.** 80% for training and model selection, with a locked 20% holdout (1,409 customers) scored once at the end.

**Benchmark.** Five model families are compared with stratified 5-fold cross-validation. Classes are balanced with weights rather than SMOTE, so predicted probabilities stay meaningful.

| Model | CV ROC-AUC | ± std | CV PR-AUC | Brier |
|---|---|---|---|---|
| Stacked ensemble | 0.910 | 0.008 | 0.794 | 0.106 |
| XGBoost | 0.908 | 0.007 | 0.792 | 0.118 |
| CatBoost | 0.908 | 0.007 | 0.792 | 0.115 |
| LightGBM | 0.904 | 0.007 | 0.785 | 0.115 |
| Logistic regression | 0.899 | 0.010 | 0.769 | 0.135 |
| Random forest | 0.898 | 0.009 | 0.769 | 0.114 |

**Significance.** Paired bootstrap tests show the stack beats logistic regression (+0.010 AUC, 95% CI +0.004 to +0.015) and random forest (+0.007, CI +0.002 to +0.012), and is statistically level with the gradient-boosted models. It was chosen for stability and calibration, not for a headline gain.

**Stacking and calibration.** A logistic meta-learner combines the base models' out-of-fold probabilities, and isotonic regression calibrates the output. A 30% score means about 30 in 100 such customers leave.

**Holdout results:**

| Metric | Value |
|---|---|
| ROC-AUC | 0.923 |
| PR-AUC | 0.798 |
| Expected calibration error | 1.4% |
| Brier score | 0.096 |
| Log loss | 0.315 |
| Lift in the top decile | 3.36× |

**Uncertainty.** Mondrian (class-conditional) split conformal prediction at α = 0.1 gives each customer a prediction set. Coverage on the holdout is 93.1% against a 90% target, and 24% of customers are flagged "Uncertain" rather than being given a falsely confident label.

**Honest scores in the product.** Training customers are shown their out-of-fold score and holdout customers their holdout score, so no customer in the app is scored by a model that saw them.

## 4. Why

Exact TreeSHAP values from the LightGBM member give each customer's top five risk drivers, in log-odds. Across the portfolio the strongest drivers are:
- contract length
- referrals made
- dependents
- tenure
- monthly bill
- a month-to-month contract
- age

**Exit reasons.** A separate model tried to predict the reason a churner gives (competitor, attitude, dissatisfaction, price, other) from the profile. It scored 44.0% accuracy against a 45.0% majority baseline, so exit reasons are not predictable from the profile. The playbook is therefore keyed on SHAP drivers instead, and a month-3 pulse survey is recommended to capture reasons earlier.

## 5. When, and what each customer is worth

**The problem.** A one-quarter snapshot only contains customers who had already survived to their current tenure. A standard Cox model ignores this, and the first version produced contradictions such as an 87% quarterly risk alongside 52 months of expected remaining tenure.

**The fix.**
- **Left truncation (delayed entry):** each customer enters the risk set at tenure − 3 months, the start of the observed quarter.
- **A custom Breslow baseline hazard** that respects the delayed entry, because the standard library's baseline ignores it.
- **Conditional survival:** S(t₀ + k) / S(t₀), the probability of still being a customer k months from today given they are here now.

**Validation.**

| Metric | Value |
|---|---|
| Holdout c-index | 0.830 |
| Quarterly churn AUC implied by the survival model | 0.897 |
| Rank agreement with the classifier (Spearman) | 0.95 |
| Implied vs observed quarterly churn | 20.8% vs 26.5% |

Two models built independently agree on who is at risk.

**Lifetime value.** Survival-weighted CLV = Σ monthly charge × 60% margin × S(k) × discount(k), over a 60-month horizon at a 10% annual discount rate. Two versions are kept:
- **CLV if retained:** the value of keeping the customer, used for value at risk and offer ROI.
- **Expected CLV:** risk-adjusted.

Value at risk = churn probability × CLV if retained.

## 6. What actually works

**The confound.** The data records which of five offers (A to E) each customer received, but offers are assigned by tenure tier:

| Offer | Tenure window | Cost used |
|---|---|---|
| A | 66–72 months | $60 |
| B | 40–65 months | $45 |
| C | 24–39 months | $35 |
| D | 10–23 months | $25 |
| E | 1–10 months | $15 |

Comparing receivers with everyone else therefore compares long-tenure customers with short-tenure ones. A naive T-learner produced effects of 20 to 50 points, which are artefacts.

**The estimator.** A cross-fitted doubly-robust learner works inside each offer's tenure window:
- a logistic propensity model, clipped to [0.05, 0.95]
- outcome models for treated and control customers
- 3-fold cross-fitting
- a shallow LightGBM regressor on the doubly-robust pseudo-outcomes, which gives a per-customer effect (CATE)

| Offer | Naive effect | Effect within window (naive) | Doubly-robust effect | 95% CI |
|---|---|---|---|---|
| A | −20.4 | +1.3 | +1.6 | −1.0 to +4.2 |
| B | −14.9 | −3.5 | −2.3 | −5.1 to +0.6 |
| C | −4.2 | +1.2 | −0.4 | −4.6 to +3.7 |
| D | −0.4 | −6.8 | −2.8 | −6.8 to +1.3 |
| E | +25.8 | +5.8 | +2.6 | −1.1 to +6.4 |

Effects are in percentage points of churn; negative means fewer customers leave. No offer works on average, and Offer E, which every new customer receives, trends harmful. The value comes from targeting: some customers respond and others do not.

## 7. Deciding where the budget goes

**Lighthouse targeting.** For each customer and each offer they are eligible for, the optimiser computes:

> expected net value = −CATE × CLV if retained − offer cost

Customers are ranked by their best offer's net value, and the budget is spent top-down.

**Baselines,** given the same budget:
- **Business as usual:** customers ranked by churn risk, each given their tenure-tier offer.
- **Random:** random customers, each given their tenure-tier offer.

| Strategy at $15,000 | Customers | Expected saves | Net value | ROI |
|---|---|---|---|---|
| Lighthouse | 400 | 64.9 | +$55.5k | 3.7× |
| Business as usual | 620 | 3.3 | −$11.5k | −0.77× |
| Random | 399 | 1.3 | −$15.4k | −1.03× |

The Lighthouse curve flattens near $78k when no customer is left worth saving, while both baselines lose more money as the budget grows.

**A/B test sizing.** For any campaign the planner gives the sample size needed to confirm the expected effect (two-sided, α = 0.05, 80% power), with the expected effect capped at 10 points.

## 8. Segments and the playbook

**Priority.** Each active customer gets one of four priorities. Risk is compared against the profit-optimal threshold (0.163) and CLV against the median:

| Priority | Rule | Action |
|---|---|---|
| Save now | High risk, high value | Act within 7 days with the full play |
| Low-cost save | High risk, lower value | Automated, low-cost channels only |
| Grow | Low risk, high value | Upsell and referral programmes |
| Maintain | Low risk, lower value | Standard lifecycle communications |

**Plays.** Seven plays, each with a reason, actions, a channel and a KPI:
- contract lock-in
- early-life onboarding
- value reframe
- service quality
- community and referral
- payment friction
- lifecycle care

Each at-risk customer is matched to plays by summing the SHAP impact of their top drivers that each play addresses. The strongest play is primary and the next is secondary.

## 9. Fairness and monitoring

**Fairness audit (holdout recall, the share of real churners the model flags):**

| Group | Recall |
|---|---|
| Female / male | 77.0% / 62.6% |
| Senior / non-senior | 93.4% / 62.2% |
| Under 30 / 30 and over | 64.8% / 70.6% |

Seniors genuinely churn more, but the gaps are reported in the Model lab so a business can decide on thresholds per group.

**Drift.** The population stability index is computed per feature against the training distribution. Thresholds are 0.10 for watch and 0.25 for retrain. Every uploaded CSV gets a drift verdict before it is scored. The current maximum feature PSI on the holdout is 0.015.

## 10. The copilot

Gemini 2.5 Flash answers with automatic function calling over six read-only tools:
- portfolio summary
- customer search
- customer profile
- campaign optimiser
- offer evidence
- model quality

Each answer lists the tools it used, and the system prompt forbids numbers that did not come from a tool. Offer evidence is passed with an explicit sign convention so a harmful effect can't be reported as helpful.

Usage is capped at 12 answers per visitor per hour, 6 per minute and 150 per day.
