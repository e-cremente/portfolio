# Dynamic weather system

*Still Hear*'s weather is a **storm that switches on when it needs to**: the player walks into an area and it starts to rain, wind ripples across surfaces, clouds thicken into a storm sky, and every so often a bolt lights up the scene with a flash and a thunderclap. It isn't a global, always-on weather cycle: it's a **volume** the level designers place wherever they want the atmosphere, entirely **data-driven** — a single data asset describes *everything* that storm does, on the way in and on the way out.

This page explains how it's built: the volume that orchestrates the four subsystems (rain, wind, lightning, clouds), the "giant" data asset that configures them, and the **single lightnings** — scripted strikes, on a timer or a trigger, that can also electrify a set-piece prop.

---

## Overview

The system has two halves, coexisting without depending on each other:

| Half | Class | Role |
|---|---|---|
| **The area storm** | `ARainyWeatherVolume` | A box trigger that, when the player enters, switches on rain + wind + ambient lightning + storm clouds, reading a `URainyWeatherDataAsset`. On exit, it switches them off. |
| **The single lightning** | `ASingleLightningBase` (+ children) | A one-off bolt — VFX, sound, camera FX, and the optional electrification of an `AElectrifiedPole` — fired on a timer or when the player enters a trigger. |

The common thread across the whole system is that **almost nothing is hard-wired in code**: the volume reads a data asset, and the "live" values (material parameters, Niagara variables) flow through a centralized name catalog instead of scattered strings.

---

## The storm volume

`ARainyWeatherVolume` is an actor with a `UBoxComponent` as its root (the trigger), plus the components it needs: the rain Niagara VFX, a `UPostProcessComponent` for the flash, and a lightning plane (`LightningPlane`) with its area. Everything starts from two overlap events on the box:

```cpp
// RainyWeatherVolume.cpp — BeginPlay
Volume->OnComponentBeginOverlap.AddUniqueDynamic(this, &ThisClass::Activate);
Volume->OnComponentEndOverlap.AddUniqueDynamic(this, &ThisClass::Deactivate);
```

### A four-subsystem orchestrator

When the player enters, `Activate` switches on **four independent subsystems** — rain, wind, lightning, clouds — each behind its own toggle in the data asset, and each with the option to start **delayed**:

```cpp
// RainyWeatherVolume.cpp — Activate (condensed)
if (RainyWeatherDataAsset->bDelayRain)
    GetWorldTimerManager().SetTimer(RainTimerHandle, this, &ThisClass::StartRain, RainyWeatherDataAsset->RainDelayTime, false);
else
    StartRain();

if (RainyWeatherDataAsset->bActivateWind)        { /* same shape: delay? timer : StartWind() */ }
if (RainyWeatherDataAsset->bActivateLightnings)  { /* … TriggerLightning() */ }
if (RainyWeatherDataAsset->bModifyVolumetricClouds) { /* … ChangeVolumetricClouds() */ }
```

`Deactivate` is the mirror image: it switches off each subsystem, again with a possible, separate exit delay. There's one exception — **cinematic mode**: if `bCinematicMode` is on, leaving the volume does *not* stop the storm (handy when the scene must stay stormy through a cutscene, even as the player moves).

### The recurring pattern: delay, then "smooth or snap"

Each subsystem follows the same two-step pattern, which keeps the system predictable to read and to extend:

1. **Delay?** On entry (and exit) each effect can start immediately or after a timer — so thunder can precede the rain, clouds can gather first, and so on.
2. **Smooth or snap?** Once started, the effect either **snaps** to its final value, or **eases into it with a lerp** over a configurable time. The lerp runs in `Tick`, driven by `bLerping…` flags.

For rain, the ramp isn't linear but **quartic**, so the downpour "builds" gently at first and accelerates toward the peak:

```cpp
// RainyWeatherVolume.cpp — LerpRain (condensed)
float Alpha = LerpingRainTime / RainyWeatherDataAsset->RainTimeToReachMaxIntensity;
Alpha = FMath::Pow(Alpha, 4);   // quartic ease-in
RainVFX->SetVariableFloat(RainyWeatherParameterNames::SpawnRate, FMath::Lerp(0, TrueMaxSpawnRate, Alpha));
RainMaterialParameterCollectionInstance->SetScalarParameterValue(RainyWeatherParameterNames::Rain,    CurrentIntensity);
RainMaterialParameterCollectionInstance->SetScalarParameterValue(RainyWeatherParameterNames::Wetness, CurrentIntensity);
```

### The four subsystems at a glance

| Subsystem | How it's built |
|---|---|
| **Rain** | A Niagara VFX (`SpawnRate`, `Velocity`, `SpriteSize`, `BoxSize`) plus two scalars — `Rain` and `Wetness` — on a shared **Material Parameter Collection**, so the world's surfaces get wet along with the rain. The rain box matches the volume, or uses a custom size. It can follow the player. |
| **Wind** | A `Wind` scalar on the same MPC (bends foliage/surfaces), with the same delay + smooth pattern. |
| **Lightning (ambient)** | A billboard plane that repositions randomly within an area, picks a random texture, orients toward the player, and is "lit" by an **appearance curve** (`LightningPercentage`) on a dynamic material; an optional **screen flash** via post-process. It then schedules the next strike at a random interval. |
| **Volumetric clouds** | A whole block of parameters on a second MPC (`StormClouds`, `LightningFlicker`, storm colours…). Unreal's default values are read at `BeginPlay` and then driven to storm values, with an optional blend. |

### The ambient lightning cycle

Ambient lightning is the most choreographed piece. On each strike, `TriggerLightning` picks a random texture and position within the area, orients the plane toward the player, and (if requested) raises the post-process exposure for the flash. Then `Tick` runs the appearance curve:

```cpp
// RainyWeatherVolume.cpp — GoThroughLightningCurve (condensed)
CurrentLightningTime += DeltaTime;
const float Alpha = RainyWeatherDataAsset->LightningAppearanceCurve->GetFloatValue(CurrentLightningTime);
LightningMaterialInstance->SetScalarParameterValue(RainyWeatherParameterNames::LightningPercentage, Alpha);

if (CurrentLightningTime >= CurveLightningTime)   // curve finished
{
    // hide the bolt, restore exposure, schedule the next strike
    LightningMaterialInstance->SetScalarParameterValue(RainyWeatherParameterNames::LightningPercentage, /* -1 = invisible */);
    SetNextLightningTime();   // RandRange(Min, Max)
}
```

Between strikes, if the storm follows the player, the lightning area moves behind them; during the strike it stays put, so the bolt doesn't "slide".

---

## The "giant" data asset

All of that behaviour is configured by a single `URainyWeatherDataAsset`. It's deliberately large — dozens of properties — but **ordered by intent** and, above all, **self-filtering**: nearly every field has an `EditCondition` that shows it only when it's relevant. Turn on `bActivateWind`? The wind fields appear. Tick `bDelayRain`? The delay time shows up. So the designer never wades through a wall of disabled properties.

```cpp
// RainyWeatherDataAsset.h — properties self-hide based on the flags
UPROPERTY(EditDefaultsOnly, Category = "Enter|Wind",
    meta = (EditCondition = "bActivateWind && bDelayWind", EditConditionHides, ClampMin = "0.0"))
float WindDelayTime;
```

The categories tell the structure on their own:

| Category | What it holds |
|---|---|
| `Configuration` | Follow-player, rain and lightning offsets. |
| `Enter\|Rain` · `Enter\|Wind` | Max intensity, delay, smooth-in, spawn rate, velocity, sizes. |
| `Enter\|Lightnings` | Colour, appearance curve, min/max interval between strikes, screen flash. |
| `Enter\|Clouds` | The volumetric clouds' storm parameters (scalars and colours). |
| `Exit\|…` | For each subsystem, its own **exit** delays and smooths, separate from the entry ones. |

The **Enter / Exit** split is the key: entering and leaving aren't necessarily symmetric — rain can build fast and then fade slowly, lightning can cut out at once while the clouds thin out calmly.

### Centralized parameter names

Materials and VFX are driven by name. Instead of scattering magic strings through the code, all the names live in one place, `RainyWeatherParameterNames`:

```cpp
// RainyWeatherParameterNames.h
namespace RainyWeatherParameterNames
{
    inline const FName SpawnRate  = "SpawnRate";     // Niagara variable
    inline const FName Rain       = "Rain";          // rain MPC
    inline const FName Wetness    = "Wetness";
    inline const FName StormClouds = "StormClouds";  // clouds MPC
    // …
}
```

It's the same principle as the enemies' blackboard-key catalog: a wrong or renamed name is fixed in one spot, and there's no way for C++ and assets to fall out of sync in silence.

---

## The single lightnings

Alongside the storm's *ambient* lightning are the **single** lightnings: one-off, scripted strikes, independent of the volume. They're for the "big" moments — a bolt landing on an exact spot, with thunder, a camera shake, and maybe a set-piece prop that electrifies.

`ASingleLightningBase` (abstract) holds everything *one* bolt does when it fires:

```cpp
// SingleLightningBase.cpp — TriggerLightning (condensed)
LightningVfx->Activate(true);                 // the bolt VFX
if (Pole) Pole->StartEffect();                // electrifies the linked pole
// SFX (optionally delayed so the thunder arrives after the flash)
// and a CameraEffects preset: shake / FOV / offset
CachedCameraEffectComponent->PlayEffectPreset(CameraEffects);
```

The sound delay is a touch of realism: the **flash is seen at once, the thunder arrives later** (`SoundDelayTime`). The camera preset reuses the same `CameraEffects` subsystem as the rest of the game, so a bolt "reads" in the cinematography too.

Two ways to fire the strike derive from this base:

| Class | Trigger |
|---|---|
| `ASingleLightningTimer` | On a timer: a fixed interval, or a random one between `MinTime` and `MaxTime`, that reschedules itself after each strike. |
| `ASingleLightningTrigger` | On contact: a box that, when the player enters, fires **once** and then disables itself. |

### The electrified pole

`AElectrifiedPole` is a small prop actor: a mesh plus a switched-off electric Niagara VFX. A single lightning can reference and "switch it on":

```cpp
// ElectrifiedPole.cpp
void AElectrifiedPole::StartEffect() { ElectricEffect->Activate(true); }
```

It's the hook that turns a bolt from pure atmosphere into a **gameplay/scene beat**: the strike lands, the pole electrifies, and the rest of the level can react.

---

## Designer guide

For an area storm:

1. **Place the volume.** Drag an `ARainyWeatherVolume` into the level and scale the box to cover the storm's area.
2. **Assign the assets.** Hook up a `RainyWeatherDataAsset`, the two **Material Parameter Collections** (rain and clouds) and the array of lightning textures.
3. **Configure the data asset.** Turn on only the subsystems you want (`bActivateWind`, `bActivateLightnings`, `bModifyVolumetricClouds`); irrelevant fields hide themselves. Tune intensities, delays and smooth times, keeping entry and exit separate.
4. **Cutscene?** Enable `bCinematicMode` to keep the storm on even when the player leaves the volume.
5. **Debug.** Enable `bShowAreaExtents` on the data asset to see the rain and lightning areas on screen while you tune them (the volume ticks in the editor viewport too, so you see changes live).

For a single lightning: place an `ASingleLightningTimer` (for recurring atmospheric strikes) or an `ASingleLightningTrigger` (for a scripted strike on the player's arrival), assign VFX/SFX, the camera preset, the `SoundDelayTime` for the flash-to-thunder gap, and — if needed — link an `AElectrifiedPole`.

**Quick checklist**

| Goal | Where to act |
|---|---|
| Heavier/lighter rain | `RainMaxIntensity`, `RainMaxSpawnRate` |
| Storm "builds" instead of snapping | `bSmoothRainIntensity` + `RainTimeToReachMaxIntensity` |
| More frequent lightning | `Min`/`MaxTimeBetweenLightnings` |
| On-screen bolt flash | `bScreenFlash` + `PostProcessExposureDuringLightning` |
| Thunder lagging the flash | `SoundDelayTime` (single lightning) |
| Weather that persists in a cutscene | `bCinematicMode` on the volume |

---

## Programmer guide

- **Adding a subsystem** (e.g. fog): follow the existing pattern — a `bActivate…` flag + optional delay in the data asset, a `Start…`/`Stop…` called from `Activate`/`Deactivate`, and (if you need smoothing) a `Lerp…` driven by a flag in `Tick`. Put the parameter names in `RainyWeatherParameterNames`.
- **A new kind of single lightning**: subclass `ASingleLightningBase` and override `TriggerLightning` (calling `Super`) for your trigger — after the pattern of `Timer` and `Trigger`.
- **Driving the world from the weather**: scalar/vector values flow through the Material Parameter Collections, so any material that reads them (terrain, foliage, surfaces) reacts to rain, wind and storm automatically, with no extra code.

---

## Traps and notes

- **The volume always ticks, even in the editor.** `ShouldTickIfViewportsOnly` is `true` on purpose, for live preview and debug boxes; but it means the per-frame work (lerps, the lightning curve) must stay lean.
- **Entry and exit are independent.** Don't assume leaving is the exact reverse of entering: they have separate delays and smooths, and `bCinematicMode` skips deactivation entirely.
- **Ambient ≠ single.** The volume's lightning (billboard plane on a curve, cyclic) and the single lightnings (Niagara VFX, scripted, with a pole) are two distinct systems: don't confuse them when adding a strike for a specific moment — you almost always want an `ASingleLightning*`.
- **Material Parameter Collections are global.** Writing to their scalars changes *every* material that uses them: that's exactly what makes the world go "wet" together, but keep in mind that two weather volumes active at once compete for the same MPC.
