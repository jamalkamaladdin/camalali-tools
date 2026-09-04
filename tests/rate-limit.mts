import type { CheckSuite } from "./harness.mts";
import {
  buildAllowedCurve,
  computeRateLimit,
  DEFAULT_RATE_LIMIT_INPUT,
  slidingWindowEstimate,
  tokenBucketAdmit,
  type AlgorithmInput,
} from "../lib/rate-limit";

const EPS = 1e-6;

function withInput(patch: Partial<AlgorithmInput>): AlgorithmInput {
  return { ...DEFAULT_RATE_LIMIT_INPUT, ...patch };
}

export const checks: CheckSuite = (check) => {
  const known = computeRateLimit(withInput({ ratePerSecond: 10, windowSeconds: 60, burstCapacity: 30, userCount: 500 }));
  check(
    "bilinən cavab: 10 sorğu/san, 60 saniyəlik pəncərə → pəncərə həddi 600",
    known.ok && known.windowLimit === 600,
    JSON.stringify(known),
  );

  check(
    "sabit pəncərə sərhəddə İKİ QAT buraxır: boundaryBurstAllowed = 2 × pəncərə həddi (1200)",
    known.ok && known.fixedWindow.boundaryBurstAllowed === 1200,
    JSON.stringify(known),
  );

  check(
    "sürüşən pəncərə sərhəddə cəmi bir pəncərə qədər buraxır (600), sabit pəncərənin yarısı",
    known.ok && known.slidingWindow.boundaryEstimate === 600 && known.slidingWindow.boundaryEstimate * 2 === known.fixedWindow.boundaryBurstAllowed,
    JSON.stringify(known),
  );

  const bucket = computeRateLimit(withInput({ ratePerSecond: 5, burstCapacity: 50 }));
  check(
    "token bucket: boş vedrənin dolma vaxtı = tutum / doldurma sürəti (50/5=10san)",
    bucket.ok && Math.abs(bucket.tokenBucket.emptyToFullSeconds - 10) < EPS,
    JSON.stringify(bucket),
  );

  const hourlyDaily = computeRateLimit(withInput({ ratePerSecond: 2 }));
  check(
    "saatlıq/günlük hədd sadə hasil: 2×3600=7200 saatlıq, 2×86400=172800 günlük",
    hourlyDaily.ok && hourlyDaily.hourlyLimit === 7200 && hourlyDaily.dailyLimit === 172800,
    JSON.stringify(hourlyDaily),
  );

  const load = computeRateLimit(withInput({ ratePerSecond: 3, userCount: 200 }));
  check(
    "N istifadəçi üçün ümumi yük = sürət × istifadəçi sayı (3×200=600)",
    load.ok && load.totalLoadPerSecondForUsers === 600,
    JSON.stringify(load),
  );

  const retryAfter = computeRateLimit(withInput({ ratePerSecond: 4 }));
  check(
    "Retry-After = 1 tokenin dolması üçün lazım olan vaxtın yuxarı yuvarlaqlaşdırılması (1/4=0.25 → 1san)",
    retryAfter.ok && retryAfter.headers.retryAfterSeconds === 1,
    JSON.stringify(retryAfter),
  );

  const overflow = tokenBucketAdmit(30, 100);
  check(
    "token bucket: tutumdan çox partlayış — tutum qədəri buraxılır, qalanı rədd edilir (30 buraxıldı, 70 rədd)",
    overflow.granted === 30 && overflow.rejected === 70,
    JSON.stringify(overflow),
  );

  const underflow = tokenBucketAdmit(30, 10);
  check(
    "token bucket: tutumdan az partlayış — hamısı buraxılır, rədd sıfırdır",
    underflow.granted === 10 && underflow.rejected === 0,
    JSON.stringify(underflow),
  );

  const zeroRate = computeRateLimit(withInput({ ratePerSecond: 0 }));
  check("sıfır sürət xəta qaytarır, throw etmir", zeroRate.ok === false, JSON.stringify(zeroRate));

  const negativeWindow = computeRateLimit(withInput({ windowSeconds: -5 }));
  check("mənfi pəncərə uzunluğu xəta qaytarır", negativeWindow.ok === false, JSON.stringify(negativeWindow));

  const fractionalUsers = computeRateLimit(withInput({ userCount: 2.5 }));
  check("tam ədəd olmayan istifadəçi sayı xəta qaytarır", fractionalUsers.ok === false, JSON.stringify(fractionalUsers));

  check(
    "sürüşən pəncərənin çəkili qiyməti sərhəddən (elapsed=0) əvvəlki pəncərənin tam sayına bərabərdir",
    Math.abs(slidingWindowEstimate(600, 0, 0, 60) - 600) < EPS,
    String(slidingWindowEstimate(600, 0, 0, 60)),
  );
  check(
    "sürüşən pəncərənin çəkisi bir pəncərə keçəndən sonra sıfıra düşür (yalnız cari sayılır)",
    Math.abs(slidingWindowEstimate(600, 50, 60, 60) - 50) < EPS,
    String(slidingWindowEstimate(600, 50, 60, 60)),
  );

  const curve = buildAllowedCurve({ windowSeconds: 60, windowLimit: 600, tokenBucketCapacity: 30, refillRatePerSecond: 10 });
  const justAfterBoundary = curve.find((p) => p.t > 60 && p.t < 70);
  check(
    "sərhəddən dərhal sonra sabit pəncərə artıq 2× hədddədir, sürüşən pəncərə isə hələ ~1× hədddədir",
    justAfterBoundary !== undefined && justAfterBoundary.fixed === 1200 && justAfterBoundary.sliding < 700,
    JSON.stringify(justAfterBoundary),
  );
};
