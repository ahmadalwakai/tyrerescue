# محرك التسعير — آلية الاستنساخ الكاملة

> مستخرج بالبحث الكامل في مشروع TyreRescue

---

## 1. المعمارية العامة

محرك التسعير مقسَّم إلى طبقات منفصلة يمكن استنساخ كل طبقة بشكل مستقل:

| الطبقة | الملف | الوظيفة |
|--------|-------|---------|
| المحرك الرئيسي | `lib/pricing-engine.ts` | الحساب الكامل للسعر النهائي |
| رسوم التنقل | `lib/fitting-location-pricing.ts` | حساب رسوم المسافة |
| تعديل الطقس | `lib/pricing/weather-modifier.ts` | رسوم إضافية حسب الطقس |
| تعديل الزحمة | `lib/pricing/traffic-modifier.ts` | رسوم إضافية حسب حركة المرور |
| تخزين القواعد | جدول `pricingRules` في DB | قواعد التسعير القابلة للتعديل |
| لقطة الحجز | `bookings.priceSnapshot` (JSONB) | تجميد السعر عند الحجز |

---

## 2. أنماط الخدمة (Pricing Modes)

ثلاثة أنماط فقط، يُحدَّد النمط تلقائياً من بيانات الطلب:

```typescript
type PricingMode =
  | 'scheduled_shop'     // حجز مسبق في الورشة
  | 'scheduled_mobile'   // حجز مسبق بالتنقل إلى العميل
  | 'emergency_mobile';  // طارئ بالتنقل إلى العميل

function resolvePricingMode(input): PricingMode {
  if (input.mode) return input.mode;
  if (input.pricingContext === 'scheduled_garage_fitting' || input.fittingLocation === 'shop')
    return 'scheduled_shop';
  if (input.pricingContext === 'emergency_mobile_fitting' || input.bookingType === 'emergency')
    return 'emergency_mobile';
  return 'scheduled_mobile'; // الافتراضي
}
```

---

## 3. هيكل البيانات

### المدخلات `PricingInput`

```typescript
interface PricingInput {
  // إلزامي
  tyreSelections: TyreSelection[];   // الإطارات المختارة
  distanceMiles: number;             // المسافة (للتنقل)
  bookingType: 'emergency' | 'scheduled';
  bookingDate: Date;
  isBankHoliday: boolean;

  // اختياري
  mode?: PricingMode;                // يُحسب تلقائياً إن لم يُعطَ
  fittingLocation?: 'shop' | 'mobile';
  serviceType?: 'repair' | 'fit' | 'both' | 'assess' | 'locking_nut';
  maxAutoPricingMiles?: number;      // الافتراضي 190
  surgeMultiplier?: number;          // مضاعف الطلب المرتفع
  outOfHoursFee?: number;            // رسوم ما بعد الدوام (18:00–22:00)
  nightFee?: number;                 // رسوم الليل (22:00–06:00)
  weatherSurcharge?: number;         // رسوم الطقس المحسوبة مسبقاً
  trafficSurcharge?: number;         // رسوم الزحمة المحسوبة مسبقاً
}

interface TyreSelection {
  tyreId: string;
  quantity: number;
  unitPrice: number;                 // من قاعدة البيانات مباشرة
  service: 'fit' | 'repair' | 'assess' | 'locking_nut';
  requiresTpms?: boolean;
}
```

### المخرجات `PricingBreakdown`

```typescript
interface PricingBreakdown {
  lineItems: PricingLineItem[];  // تفصيل كل بند
  totalTyreCost: number;         // مجموع تكلفة الإطارات
  totalServiceFee: number;       // مجموع رسوم الخدمة (عمالة + TPMS فقط)
  calloutFee: number;            // رسوم التنقل
  totalSurcharges: number;       // مجموع الرسوم الإضافية
  discountAmount: number;        // قيمة الخصم
  surgeMultiplier: number;       // مضاعف الطلب المطبَّق
  subtotal: number;              // الإجمالي قبل الضريبة
  vatRate: number;               // نسبة ضريبة القيمة المضافة
  vatAmount: number;             // قيمة الضريبة
  total: number;                 // السعر النهائي للعميل
  quoteExpiresAt: Date;          // صلاحية العرض (15 دقيقة)
  isValid: boolean;
  error?: string;
}
```

### رموز البنود التفصيلية `LineItemCode`

```typescript
type LineItemCode =
  | 'TYRE_SUBTOTAL'
  | 'LABOUR_FIT' | 'LABOUR_REPAIR'
  | 'TPMS'
  | 'TRAVEL_DISTANCE'
  | 'TRAFFIC_DELAY'
  | 'WEATHER_LIGHT_RAIN' | 'WEATHER_HEAVY_RAIN' | 'WEATHER_SNOW_ICE'
  | 'EMERGENCY_PRIORITY'
  | 'CALENDAR_WEEKEND' | 'CALENDAR_BANK_HOLIDAY'
  | 'BUNDLE_DISCOUNT'
  | 'DYNAMIC_DEMAND'
  | 'MINIMUM_SERVICE_ADJUSTMENT'
  | 'OUT_OF_HOURS_FEE' | 'NIGHT_FEE'
  | 'ADMIN_ADJUSTMENT'
  | 'LINE_SUBTOTAL' | 'LINE_TOTAL';
```

---

## 4. قواعد التسعير (جدول `pricingRules`)

جميع القيم مخزنة في جدول key-value قابلة للتعديل من لوحة الإدارة:

### رسوم العمالة (جنيه إسترليني / إطار)

| المفتاح | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `shop_fit_labour_per_tyre` | £18 | تركيب في الورشة |
| `shop_repair_labour_per_tyre` | £25 | إصلاح في الورشة |
| `mobile_fit_labour_per_tyre` | £18 | تركيب بالتنقل |
| `mobile_repair_labour_per_tyre` | £25 | إصلاح بالتنقل |
| `emergency_fit_labour_per_tyre` | £22 | تركيب طارئ |
| `emergency_repair_labour_per_tyre` | £30 | إصلاح طارئ |
| `tpms_fee_per_tyre` | £10 | إعادة ضبط حساسات الضغط |

### رسوم إضافية ثابتة

| المفتاح | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `emergency_priority_fee` | £47 | رسوم الأولوية الطارئة |
| `shop_weekend_fee` | £10 | نهاية الأسبوع (ورشة) |
| `mobile_weekend_fee` | £12 | نهاية الأسبوع (تنقل) |
| `shop_bank_holiday_fee` | £20 | إجازة رسمية (ورشة) |
| `mobile_bank_holiday_fee` | £25 | إجازة رسمية (تنقل) |
| `emergency_bank_holiday_fee` | £45 | إجازة رسمية (طارئ) |

### حدود الحد الأدنى

| المفتاح | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `mobile_min_service_subtotal` | £47 | الحد الأدنى لقيمة الخدمة (تنقل مجدوَل) |
| `emergency_min_service_subtotal` | £90 | الحد الأدنى لقيمة الخدمة (طارئ) |
| `minimum_order_total` | £50 | الحد الأدنى للطلب الكلي (ورشة) |

### خصومات الكميات (نسبة مئوية، تُطبَّق على العمالة فقط)

| المفتاح | القيمة الافتراضية | الشرط |
|---------|-------------------|-------|
| `multi_tyre_discount_2` | 5% | إطاران (غير طارئ) |
| `multi_tyre_discount_3` | 8% | 3 إطارات (غير طارئ) |
| `multi_tyre_discount_4` | 12% | 4+ إطارات (غير طارئ) |
| `emergency_multi_tyre_discount_3` | 3% | 3 إطارات (طارئ) |
| `emergency_multi_tyre_discount_4` | 5% | 4+ إطارات (طارئ) |

### إعدادات النظام

| المفتاح | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `max_service_miles` | 190 | أقصى مسافة للتسعير التلقائي |
| `quote_expiry_minutes` | 15 | مدة صلاحية العرض السعري |
| `surge_pricing_enabled` | false | تفعيل التسعير الديناميكي |

---

## 5. خوارزمية الحساب خطوة بخطوة

```
┌──────────────────────────────────────────────────────────────┐
│              calculatePricing(input, rules)                   │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
[1] تحديد النمط (Mode)
    resolvePricingMode(input) → 'scheduled_shop' | 'scheduled_mobile' | 'emergency_mobile'
         │
         ▼
[2] رسوم الإطارات
    tyreTotal = Σ (unitPrice × quantity) لكل TyreSelection
         │
         ▼
[3] رسوم العمالة (per tyre × quantity)
    للـ 'fit'         → getFitRate(mode, rules)        × qty
    للـ 'repair'      → getRepairRate(mode, rules)     × qty
    للـ 'assess'      → max(10, fitRate × 0.5)         × qty
    للـ 'locking_nut' → max(10, fitRate × 0.5)         × qty
         │
         ▼
[4] رسوم TPMS (اختياري)
    إذا كانت requiresTpms = true:
    tpmsTotal = rules.tpms_fee_per_tyre × quantity
         │
         ▼
[5] رسوم التنقل (للنمط mobile فقط)
    calculateTravelFee(distanceMiles, maxAutoPricingMiles)
    إذا كان distanceMiles > maxAutoPricingMiles → يتطلب تسعيراً يدوياً (null)
         │
         ▼
[6] رسوم الأولوية (للطارئ فقط)
    emergencyFee = rules.emergency_priority_fee (£47)
         │
         ▼
[7] رسوم التقويم
    إذا كان نهاية أسبوع (ليس طارئ) → weekendFee حسب النمط
    إذا كان إجازة رسمية             → bankHolidayFee حسب النمط
         │
         ▼
[8] رسوم الطقس (mobile فقط)
    calculateWeatherSurcharge({ mode, weatherCode })
         │
         ▼
[9] رسوم الزحمة (mobile فقط)
    calculateTrafficSurcharge({ mode, distanceMiles, durationMinutes })
         │
         ▼
[10] رسوم خارج الدوام / الليل (طارئ mobile فقط)
    outOfHoursFee + nightFee (إذا وُجدا)
         │
         ▼
[11] خصم الكميات (على العمالة فقط)
    discountRate = getBundleDiscountRate(mode, totalQty, rules)
    discountAmount = totalLabour × discountRate / 100
         │
         ▼
[12] مضاعف الطلب المرتفع (Surge Pricing)
    يُطبَّق على الخدمة فقط (ليس الإطارات):
    scheduled_shop:   0.95 – 1.10
    scheduled_mobile: 0.95 – 1.15
    emergency_mobile: 1.00 – 1.25
         │
         ▼
[13] التحقق من الحد الأدنى
    serviceSubtotal = (عمالة + تنقل + رسوم إضافية - خصم) × surgeMultiplier
    إذا كان serviceSubtotal < minServiceSubtotal →
      إضافة MINIMUM_SERVICE_ADJUSTMENT
         │
         ▼
[14] الإجمالي النهائي
    total = tyreTotal + serviceSubtotal
    للورشة: total = max(total, minimum_order_total)
    VAT: 0% حالياً (البنية موجودة جاهزة)
         │
         ▼
[15] انتهاء الصلاحية
    quoteExpiresAt = now() + quote_expiry_minutes
```

---

## 6. صيغ الحساب التفصيلية

### صيغة رسوم التنقل — معادلة متدرجة مستمرة

```typescript
function calculateTravelFee(distanceMiles: number, maxMiles = 190): number | null {
  if (distanceMiles > maxMiles) return null; // يتطلب تسعيراً يدوياً

  const fee =
    24.00                                    // قاعدة ثابتة (0–3 ميل)
    + milesBetween(d, 3, 10)   * 1.70       // 3–10 ميل
    + milesBetween(d, 10, 20)  * 2.35       // 10–20 ميل
    + milesBetween(d, 20, 40)  * 3.00       // 20–40 ميل
    + milesBetween(d, 40, 60)  * 3.85       // 40–60 ميل
    + milesBetween(d, 60, maxMiles) * 4.25; // 60+ ميل

  // للطارئ: fee × 1.15
  return roundTo2dp(fee);
}

// دالة مساعدة: الأميال ضمن نطاق
function milesBetween(actual: number, from: number, to: number): number {
  return Math.max(0, Math.min(actual, to) - from);
}
```

**مثال:** 15 ميل مجدوَل:
```
£24 + (7 × £1.70) + (5 × £2.35)
= £24 + £11.90 + £11.75
= £47.65
```

---

### صيغة رسوم الطقس — قيم ثابتة

```typescript
// تنقل مجدوَل
const SCHEDULED_MOBILE_SURCHARGES = {
  NONE:           £0,
  LIGHT_RAIN:     £5,
  HEAVY_RAIN:     £12,
  SNOW_ICE:       £20,
  SEVERE_WEATHER: null, // يتطلب عرضاً يدوياً
};

// طارئ
const EMERGENCY_MOBILE_SURCHARGES = {
  NONE:           £0,
  LIGHT_RAIN:     £10,
  HEAVY_RAIN:     £20,
  SNOW_ICE:       £35,
  SEVERE_WEATHER: null, // يتطلب عرضاً يدوياً
};

// الورشة لا تتأثر بالطقس
```

---

### صيغة رسوم الزحمة — معادلة مستمرة بحد أقصى

```typescript
function calculateTrafficSurcharge({ mode, distanceMiles, durationMinutes }): number {
  // السرعة الأساسية: 30 ميل/ساعة = دقيقتان/ميل
  const expectedMinutes = distanceMiles * 2;
  const delayMinutes = Math.max(0, durationMinutes - expectedMinutes);

  if (mode === 'emergency_mobile') {
    return Math.min(delayMinutes * 0.75, 35); // £0.75/دقيقة، حد أقصى £35
  }
  return Math.min(delayMinutes * 0.45, 20);   // £0.45/دقيقة، حد أقصى £20
}
```

---

### صيغة التسعير الديناميكي (Surge Pricing)

```typescript
function resolveDemandMultiplier(
  mode: PricingMode,
  surgeMultiplier: number | undefined,
  surgePricingEnabled: boolean
): number {
  if (!surgePricingEnabled || surgeMultiplier === undefined) return 1.0;

  switch (mode) {
    case 'emergency_mobile':
      return clamp(surgeMultiplier, 1.00, 1.25);  // +0% إلى +25%
    case 'scheduled_mobile':
      return clamp(surgeMultiplier, 0.95, 1.15);  // -5% إلى +15%
    case 'scheduled_shop':
      return clamp(surgeMultiplier, 0.95, 1.10);  // -5% إلى +10%
  }
}

// ⚠️ يُطبَّق على الخدمة فقط — الإطارات لا تخضع للـ surge
```

---

## 7. بنية قاعدة البيانات المطلوبة

### جدول `pricing_rules`

```sql
CREATE TABLE pricing_rules (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,          -- مخزون كـ string، يُحوَّل عند الاستخدام
  label       TEXT,                   -- اسم للعرض في الواجهة
  type        TEXT,                   -- 'currency' | 'percentage' | 'integer'
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### جدول `quotes`

```sql
CREATE TABLE quotes (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  item_selections JSONB,              -- TyreSelection[] أو ما يعادلها
  distance_miles  DECIMAL(5,2),
  breakdown       JSONB,              -- PricingBreakdown كاملة
  expires_at      TIMESTAMPTZ NOT NULL,
  used            BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### حقول الحجز في `bookings`

```sql
-- أضف هذه الحقول لجدول الحجوزات:
price_snapshot   JSONB NOT NULL,      -- نسخة مُجمَّدة من PricingBreakdown
subtotal         DECIMAL(10,2) NOT NULL,
vat_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
total_amount     DECIMAL(10,2) NOT NULL,
```

---

## 8. مثال تطبيقي كامل

**السيناريو:** طارئ تنقل، 3 إطارات، 15 ميل، إجازة رسمية

```
المدخلات:
  tyreSelections: [{ quantity: 3, unitPrice: £75, service: 'fit' }]
  distanceMiles: 15
  bookingType: 'emergency'
  isBankHoliday: true

──────────────────────────────────────────────────────
[2] تكلفة الإطارات:  £75 × 3             = £225.00
[3] عمالة التركيب:   £22 × 3             = £66.00
[5] رسوم التنقل:     15 ميل              = £47.65
[6] رسوم الطارئ:                          = £47.00
[7] إجازة رسمية:                          = £45.00
[11] خصم 3 إطارات طارئ (3%): -£66×3%   = -£1.98
──────────────────────────────────────────────────────
مجموع الخدمة:                             = £203.67
التحقق من الحد الأدنى (£90): ✓ تجاوز
الـ Surge Pricing: غير مفعَّل            = ×1.00
──────────────────────────────────────────────────────
المجموع الكلي: £225 + £203.67            = £428.67
ضريبة القيمة المضافة (0%):               = £0.00
السعر النهائي:                            = £428.67
انتهاء صلاحية العرض: بعد 15 دقيقة
──────────────────────────────────────────────────────

البنود التفصيلية (lineItems):
  TYRE_SUBTOTAL           £225.00
  LABOUR_FIT              £66.00
  TRAVEL_DISTANCE         £47.65
  EMERGENCY_PRIORITY      £47.00
  CALENDAR_BANK_HOLIDAY   £45.00
  BUNDLE_DISCOUNT         -£1.98
  LINE_SUBTOTAL           £428.67
  LINE_TOTAL              £428.67
```

---

## 9. ترتيب الاستنساخ المقترح

```
المرحلة 1 — البنية الأساسية:
  ✓ إنشاء جدول pricing_rules وتعبئته بالقيم الافتراضية
  ✓ نسخ وتكييف PricingInput / PricingBreakdown interfaces
  ✓ نسخ وتكييف calculateTravelFee

المرحلة 2 — المحرك الرئيسي:
  ✓ نسخ وتكييف calculatePricing
  ✓ نسخ وتكييف resolvePricingMode
  ✓ وصل النتيجة بجدول quotes (مع انتهاء الصلاحية)

المرحلة 3 — المعدِّلات الاختيارية:
  ✓ calculateWeatherSurcharge (إذا احتجت للطقس)
  ✓ calculateTrafficSurcharge (إذا احتجت لحركة المرور)
  ✓ resolveDemandMultiplier (إذا احتجت لـ surge pricing)

المرحلة 4 — التكامل:
  ✓ حقن price_snapshot في جدول الحجوزات
  ✓ واجهة إدارة قواعد التسعير (CRUD على pricingRules)
  ✓ مسار API لحساب العرض السعري
```

---

## 10. ملاحظات التطبيق

1. **دقة الأرقام:** استخدم `Decimal.js` لجميع العمليات الحسابية — لا تستخدم `float` لتجنب أخطاء التقريب.
2. **تجميد السعر:** احفظ `PricingBreakdown` كاملة في `price_snapshot` عند الحجز — القواعد قابلة للتغيير لاحقاً.
3. **صلاحية العرض:** 15 دقيقة افتراضياً، قابلة للتعديل من `pricingRules`.
4. **VAT:** البنية موجودة (`vatRate`, `vatAmount`) لكنها معطَّلة حالياً — سهل التفعيل.
5. **المسافة الحدية:** ما فوق `max_service_miles` (190 ميلاً) يعيد `null` ويتطلب تسعيراً يدوياً.
6. **خصم الكميات:** يُطبَّق على **العمالة فقط**، لا على تكلفة الإطارات.
7. **Surge Pricing:** يُطبَّق على **الخدمة فقط** — الإطارات لا تخضع للـ surge.
8. **الطارئ لا يحصل على خصم نهاية الأسبوع** — فقط رسوم الطارئ الخاصة به.
