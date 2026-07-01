# Volume-based camera system

*Still Hear* is a third-person puzzle-platformer with **fully authored cinematography**: instead of a single spring-arm camera following the player, level designers paint the world with **camera volumes**. When the player walks into a volume, that volume's camera takes over and the view blends to it. The active volume can also **re-define the movement axes**, so "push right on the stick" always means "move right on screen" — even while the camera is sweeping through a curve.

This page explains how the system is built, how the pieces talk to each other, and how to use and extend it — both from the editor (designers) and from C++ (programmers).

---

## Overview

The system has three responsibilities, each owned by a different layer:

| Responsibility | Who owns it | In short |
|---|---|---|
| **Where the camera is / how it moves** | `ACameraVolume` and its subclasses | Each volume carries its own `UCameraComponent` and the logic that positions/rotates it. |
| **Which volume is active & how we blend** | `AStillHearMainCharacter` + `AStillHearPlayerController` | The character tracks the volumes it overlaps and picks one by priority; the controller performs the actual view blend. |
| **Aligning input to the view** | `AStillHearPlayerController` | Movement input is expressed relative to the active volume's "right" direction and smoothly re-aligned when volumes change. |

The contract between the camera volumes and the player is a small interface, `ICameraVolumesInteractor`, so a volume never needs to know the concrete player class.

---

## Architecture at a glance

| Class | Type | Role |
|---|---|---|
| `ACameraVolume` | `AActor` (Abstract) | Base class. Trigger box + camera + input arrow, plus all blend/priority/rotation/input settings. |
| `AFollowSplineCamera` | `ACameraVolume` | Camera slides along a spline to always face the target from the closest point on the curve. |
| `AFollowSplineMaintainDistanceCamera` | `AFollowSplineCamera` | Same, but keeps a fixed distance from the target and clamps the camera height. |
| `ICameraVolumesInteractor` | `UInterface` | Contract implemented by anything a volume can follow (the player). |
| `AStillHearMainCharacter` | `ACharacter` | Implements the interface; keeps the list of overlapped volumes and selects the active one by priority. |
| `AStillHearPlayerController` | `APlayerController` | Runs `SetViewTargetWithBlend` and owns the input-direction alignment. |
| `ASceneManager` | `AActor` | Picks the **starting/menu** camera by location or tag at level load. |

**Component layout of a camera volume** (built in `ACameraVolume::ACameraVolume`):

```
ACameraVolume (RootComponent = Volume)
├── Volume         UBoxComponent   → inner trigger box (overlap = "player is inside")
│   ├── OuterVolume UBoxComponent  → slightly larger box (inner + 10 uu), reserved
│   ├── Camera      UCameraComponent → the view this volume provides
│   └── InputArrow  UArrowComponent → its forward vector defines screen-"right"
```

> `AStillHearCamera` also exists in the `Camera/` folder, but it is a **legacy standalone camera** and is not referenced by the volume system. Ignore it when working on camera volumes.

---

## Runtime flow: how a volume becomes active

The whole handover is driven by overlap events on the inner `Volume` box.

**1 — The volume detects the player and notifies it.** `ACameraVolume` binds its overlap events in the constructor and forwards them through the interface — it never casts to a concrete player type:

```cpp
// CameraVolume.cpp
void ACameraVolume::BeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, ...)
{
    if (OtherActor && OtherActor->Implements<UCameraVolumesInteractor>())
    {
        ICameraVolumesInteractor::Execute_AddCameraVolumeToList(OtherActor, this);
    }
}
```

**2 — The player records the volume and re-evaluates.** The character keeps every volume it currently overlaps in `CameraVolumesList`, then calls `CheckList()`:

```cpp
// StillHearMainCharacter.cpp
void AStillHearMainCharacter::AddCameraVolumeToList_Implementation(ACameraVolume* CameraVolume)
{
    if (CameraVolumesList.Contains(CameraVolume)) return;
    CameraVolumesList.Add(CameraVolume);

    // Entering a new volume means the input axes may need to be recalibrated
    if (AStillHearPlayerController* PC = Cast<AStillHearPlayerController>(GetController()))
        PC->ResetInputUpdate();

    CheckList();
}
```

**3 — Priority decides the winner.** With one volume it wins by default; with several, the **highest `Priority`** wins:

```cpp
// StillHearMainCharacter.cpp — CheckList()
int MaxPriority = -1;
ACameraVolume* NewCameraVolume = nullptr;
for (const auto Volume : CameraVolumesList)
{
    if (!IsValid(Volume)) continue;
    if (Volume->GetPriority() > MaxPriority)
    {
        MaxPriority     = Volume->GetPriority();
        NewCameraVolume = Volume;
    }
}
if (NewCameraVolume && NewCameraVolume != LastActiveCameraVolume)
    ActivateCameraVolume(NewCameraVolume);
```

**4 — Activation hands off to the controller.** The new volume is activated (its tick turns on), the previous one is deactivated (its tick turns off, to save cost), and the controller performs the blend:

```cpp
// StillHearMainCharacter.cpp
void AStillHearMainCharacter::ActivateCameraVolume(ACameraVolume* CameraVolume)
{
    AStillHearPlayerController* PC = Cast<AStillHearPlayerController>(GetController());
    if (!PC) return;

    if (bForceSnapOnNextCamera)          // spawn / respawn / after a cinematic
    {
        CameraVolume->RequestSnapToTarget();
        bForceSnapOnNextCamera = false;
    }

    CameraVolume->Activate(this);        // SetActorTickEnabled(true) + cache the followed actor
    PC->ChangeCamera(CameraVolume, LastActiveCameraVolume);

    if (LastActiveCameraVolume && LastActiveCameraVolume != CameraVolume)
        LastActiveCameraVolume->Deactivate();

    LastActiveCameraVolume = CameraVolume;
}
```

When the player leaves a volume, `EndOverlap` fires the mirror path (`RemoveCameraVolumeFromList` → `CheckList`), so the camera falls back to whatever other volume the player is still inside.

### The sequence, end to end

| Step | Trigger | Call | Result |
|---|---|---|---|
| 1 | Player enters `Volume` box | `ACameraVolume::BeginOverlap` | `Execute_AddCameraVolumeToList` |
| 2 | — | `AddCameraVolumeToList_Implementation` | volume stored, input reset requested |
| 3 | — | `CheckList` | highest-priority volume chosen |
| 4 | — | `ActivateCameraVolume` | old volume off, new one on |
| 5 | — | `AStillHearPlayerController::ChangeCamera` | `SetViewTargetWithBlend` runs the blend |
| 6 | Player leaves box | `EndOverlap` → `RemoveCameraVolumeFromList` | list updated, `CheckList` re-runs |

---

## Blending & priority

Every volume carries its own blend settings, so the *feel* of each transition is authored per-volume. `ChangeCamera` decides which blend to use:

```cpp
// StillHearPlayerController.cpp — ChangeCamera (condensed)
if (bIsInMenuMode)                 { SetViewTargetWithBlend(CameraVolume, 0.f, ...); return; }  // instant in menus
if (CameraVolume->IsSnappingToTarget()) { SetViewTargetWithBlend(CameraVolume, 0.f, ...); return; } // instant snap

if (!LastCameraVolume || !LastCameraVolume->GetUseBlendParametersOnExit())
    SetViewTargetWithBlend(CameraVolume, CameraVolume->GetBlendTimeOnEnter(), ...);   // entered volume drives the blend
else
    SetViewTargetWithBlend(CameraVolume, LastCameraVolume->GetBlendTimeOnExit(), ...); // left volume drives the blend
```

The rule in words:

- **Entering** a volume normally blends over the **entered** volume's `BlendTimeOnEnter`.
- A volume can instead take control of *its own exit* by setting `bUseBlendParametersOnExit` — then **leaving** it blends over **its** `BlendTimeOnExit`.
- A **snap** (spawn, respawn, or the first frame after a cinematic) forces a `0s` blend so the camera never visibly slides in from the previous position.

| Property | Type | Category | Meaning |
|---|---|---|---|
| `Priority` | `int` | Configuration | When volumes overlap, the highest value wins. |
| `BlendFunction` | `EViewTargetBlendFunction` | CameraBlend | Interpolation curve (Linear, Cubic, EaseIn/Out…). Default `VTBlend_Linear`. |
| `BlendExp` | `float` | CameraBlend | Exponent for the non-linear blend functions. |
| `BlendTimeOnEnter` | `float` (s) | CameraBlend | Blend duration when this volume becomes active. |
| `bUseBlendParametersOnExit` | `bool` | CameraBlend | If true, leaving this volume uses *its* exit params instead of the next volume's enter params. |
| `BlendTimeOnExit` | `float` (s) | CameraBlend | Blend duration used when leaving, if the flag above is set. |

### Snapping (no blend)

Snapping is a one-shot request consumed on the next update:

```cpp
// CameraVolume.h / .cpp
void RequestSnapToTarget()  { bShouldSnapToTarget = true; }
bool IsSnappingToTarget() const { return bShouldSnapToTarget; }
```

`AStillHearMainCharacter::bForceSnapOnNextCamera` is raised at spawn (`CheckFirstCameraAtSpawn`), on respawn (`ResetMovementState`), and after a cinematic (`AStillHearPlayerController::OnCinematicFinished` → `SetForceSnapOnNextCamera(true)`), so the first camera the player sees is always crisp, never a slow slide from the origin.

---

## Look-at rotation

If `bLookAtPlayer` is on, the base class rotates the camera to keep the target framed, using `RotationSpeed` — unless a snap is pending, in which case it rotates instantly:

```cpp
// CameraVolume.cpp — UpdateCamera (base)
const FRotator DesiredRotation =
    UKismetMathLibrary::FindLookAtRotation(CameraComponent->GetComponentLocation(),
                                           PlayerController->GetCharacter()->GetActorLocation());

if (bShouldSnapToTarget)
    CameraComponent->SetWorldRotation(DesiredRotation);                                   // instant
else
    CameraComponent->SetWorldRotation(
        FMath::RInterpTo(StartRotation, DesiredRotation, DeltaTime, RotationSpeed));       // smooth
```

| Property | Type | Category | Meaning |
|---|---|---|---|
| `bLookAtPlayer` | `bool` | CameraRotation | Enables the look-at behaviour. If off, the camera keeps its authored rotation. |
| `RotationSpeed` | `float` | CameraRotation | Interp speed for the smooth look-at (shown only when `bLookAtPlayer` is on). |

---

## Input that follows the camera

This is the piece that makes a volume-driven camera feel good to control. The movement input is **not** expressed in world axes — it is expressed relative to the active volume's `InputArrow`, whose forward vector is treated as screen-"right":

```cpp
// CameraVolume.cpp
FVector ACameraVolume::GetRightDirection() const { return InputArrow->GetForwardVector(); }
```

In the controller, "right" comes from the volume and "forward" is derived from it, so pressing up/right on the stick always maps to the screen:

```cpp
// StillHearPlayerController.cpp — HandleMoveTriggered (condensed)
const FVector ForwardInputDirection = CurrentRightInputDirection.GetSafeNormal().Cross(FVector::UpVector);
GetCharacter()->AddMovementInput(CurrentRightInputDirection, InputValue.X);
GetCharacter()->AddMovementInput(ForwardInputDirection,      InputValue.Y);
```

**The problem it solves:** if the input direction snapped instantly the moment you crossed into a volume with a different orientation, the character would visibly jerk sideways. Instead, when the active volume changes, the controller **lerps** the input direction from the old to the new over `InputAdjustingTime`:

```cpp
// StillHearPlayerController.cpp — HandleMoveTriggered
else if (CurrentRightInputDirection != CameraVolume->GetRightDirection() && !bUpdateInputDirection)
{
    InitialDirection = CurrentRightInputDirection;
    FinalDirection   = CameraVolume->GetRightDirection();
    InputAdjustingTime = CameraVolume->GetHasPlayerAdjustedToInput() ? 0.01f
                                                                     : CameraVolume->GetInputAdjustingTime();
    bUpdateInputDirection = true;
}

// StillHearPlayerController.cpp — UpdateInputDirection (per frame)
InputDirectionLerpTime += DeltaTime;
const float Alpha = InputDirectionLerpTime / InputAdjustingTime;
CurrentRightInputDirection = FMath::Lerp(InitialDirection, FinalDirection, Alpha);
if (InputDirectionLerpTime >= InputAdjustingTime)
{
    CurrentRightInputDirection = FinalDirection;
    bUpdateInputDirection = false;
    if (CameraVolume->GetInputFollowsCamera())
        CameraVolume->SetHasPlayerAdjustedToInput(true);   // subsequent re-aligns are near-instant
}
```

When `bInputFollowsCamera` is set, the `InputArrow` itself is re-oriented every tick to match the camera's right vector, so the control scheme keeps tracking a camera that is still rotating or sliding:

```cpp
// CameraVolume.cpp — UpdateInputArrow
if (!bInputFollowsCamera) return;
const FVector TargetDirection = CameraComponent->GetRightVector();
InputArrow->SetWorldRotation(FRotationMatrix::MakeFromX(TargetDirection).Rotator());
```

| Property | Type | Category | Meaning |
|---|---|---|---|
| `bInputFollowsCamera` | `bool` | Input | If true, the input "right" tracks the camera every frame (for cameras that keep moving/rotating). |
| `InputAdjustingTime` | `float` (s) | Input | How long the input direction takes to re-align when the active volume changes. Default `2.0`. |

---

## Spline cameras

### `AFollowSplineCamera`

Instead of sitting still, this camera **rides a spline**. Each frame it finds the point on the spline closest to the target, adds a designer offset, and moves there. Position is computed in `UpdateCamera` and applied in `ApplyPosition`:

```cpp
// FollowSplineCamera.cpp — UpdateCamera
Super::UpdateCamera(TargetPoint, DeltaTime);   // base handles look-at rotation

const float InputKey = Spline->FindInputKeyClosestToWorldLocation(TargetPoint);
float Distance = Spline->GetDistanceAlongSplineAtSplineInputKey(InputKey);
Distance += OffsetAlongSpline;
Distance  = FMath::Clamp(Distance, 0.0f, Spline->GetSplineLength());

DesiredCameraLocation =
    Spline->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World) + LocationOffset;
```

```cpp
// FollowSplineCamera.cpp — ApplyPosition (called from Tick)
if (bShouldSnapToTarget)
{
    CameraComponent->SetWorldLocation(DesiredCameraLocation);   // instant
    bShouldSnapToTarget = false;                                // derived class resets the flag here
}
else
{
    const float InterpSpeed = (TimeToReachTargetPoint > KINDA_SMALL_NUMBER) ? (1.0f / TimeToReachTargetPoint) : 0.0f;
    CameraComponent->SetWorldLocation(
        FMath::VInterpTo(CameraComponent->GetComponentLocation(), DesiredCameraLocation, DeltaTime, InterpSpeed));
}
```

| Property | Type | Category | Meaning |
|---|---|---|---|
| `Spline` | `USplineComponent` | Components | The path the camera travels along. |
| `TimeToReachTargetPoint` | `float` (s) | CameraBlend | Approx. time to catch up to the desired point (converted to an interp speed). |
| `OffsetAlongSpline` | `float` (uu) | CameraOffset | Shifts the camera ahead of / behind the closest point, along the spline. |
| `LocationOffset` | `FVector` | CameraOffset | A world-space offset added after sampling the spline. |

### `AFollowSplineMaintainDistanceCamera`

A specialization that additionally keeps a fixed distance from the target and clamps the camera's height — useful for keeping consistent framing on a spline that would otherwise get too close or too high:

```cpp
// FollowSplineMaintainDistanceCamera.cpp — UpdateCamera
Super::UpdateCamera(TargetPoint, DeltaTime);   // sample the spline first

FVector Direction = DesiredCameraLocation - TargetPoint;
Direction.Normalize();
DesiredCameraLocation = TargetPoint + Direction * DistanceFromActor;   // re-project to a fixed distance

if (MaxHeight != 0 && DesiredCameraLocation.Z > MaxHeight) DesiredCameraLocation.Z = MaxHeight;
if (MinHeight != 0 && DesiredCameraLocation.Z < MinHeight) DesiredCameraLocation.Z = MinHeight;
```

| Property | Type | Category | Meaning |
|---|---|---|---|
| `DistanceFromActor` | `float` (uu) | Distance From Actor | Fixed distance the camera keeps from the target. |
| `MaxHeight` | `float` (uu) | Distance From Actor | Upper clamp on the camera's Z (ignored if `0`). |
| `MinHeight` | `float` (uu) | Distance From Actor | Lower clamp on the camera's Z (ignored if `0`). |
| `ShowDesiredLocationHeight` | `bool` | Distance From Actor | Editor-only: prints the computed Z on screen to help you tune the clamps. |

---

## Spawn, respawn, menu & cinematics

The volume system doesn't only run while walking around — it's wired into every moment the view needs a valid camera:

| Situation | Entry point | What happens |
|---|---|---|
| **Level start** | `AStillHearMainCharacter::CheckFirstCameraAtSpawn` | Force-updates overlaps, adds every overlapping volume, raises the snap flag, then `CheckList()`. |
| **Main menu** | `ASceneManager::SetupMenuView` | Finds a volume by save location, else by `DefaultMenuCameraTag`, else the first one; resets it to its default transform and blends in. |
| **Respawn** | `AStillHearMainCharacter::ResetMovementState` | Clears the volume list and input state so the next `CheckList` starts clean and snaps. |
| **After a cinematic** | `AStillHearPlayerController::OnCinematicFinished` | Re-updates overlaps, forces a snap, clears the last volume, re-runs `CheckList()`. |

`ASceneManager` can also resolve a volume purely by position — handy for placing the menu/start camera without an overlapping pawn:

```cpp
// SceneManager.cpp — FindCameraVolumeAtLocation
for (AActor* Actor : FoundVolumes)
{
    ACameraVolume* Vol = Cast<ACameraVolume>(Actor);
    if (Vol && Vol->ContainsPoint(Location) && Vol->GetPriority() > BestPriority)
    {
        Best = Vol;
        BestPriority = Vol->GetPriority();
    }
}
```

`ContainsPoint` does a rotation-aware box test (transforms the point into the volume's local space), so it works even for volumes placed at an angle.

---

## Designer guide — placing a camera volume

You don't need to touch code to author cameras. Drop a volume actor into the level and configure it:

1. **Place the volume.** Add a `FollowSplineCamera`, `FollowSplineMaintainDistanceCamera`, or a Blueprint child of `ACameraVolume` to the level.
2. **Size the trigger.** Scale the inner `Volume` box to cover the area where this camera should be active. The player is "inside" when they overlap this box.
3. **Aim the camera.** Move/rotate the `Camera` component to frame the space the way you want.
4. **Set the priority.** Where two volumes overlap (transition zones), the higher `Priority` wins. Give the more specific/important shot the higher number.
5. **Author the blend.** Set `BlendTimeOnEnter` and `BlendFunction` for how the view eases in. If *this* volume should control how the camera leaves it, tick `bUseBlendParametersOnExit` and set `BlendTimeOnExit`.
6. **Choose the rotation.** Enable `bLookAtPlayer` (and tune `RotationSpeed`) for a camera that tracks the player; leave it off for a locked, framed shot.
7. **Orient the input.** Rotate the `InputArrow` so its forward arrow points where "right on the stick" should send the player on screen. Enable `bInputFollowsCamera` if the camera moves enough that the control scheme should keep tracking it; tune `InputAdjustingTime` for how gently input re-aligns on entry.
8. **For spline cameras**, shape the `Spline`, then tune `OffsetAlongSpline` / `LocationOffset` and `TimeToReachTargetPoint`. For the maintain-distance variant, set `DistanceFromActor` and the `Min`/`MaxHeight` clamps (turn on `ShowDesiredLocationHeight` while tuning).

**Quick checklist**

| Goal | Property to reach for |
|---|---|
| Two volumes fight over a spot | `Priority` |
| Transition too fast / too slow | `BlendTimeOnEnter` (or `BlendTimeOnExit`) |
| Snappy vs. eased transition | `BlendFunction` + `BlendExp` |
| Camera should track the player | `bLookAtPlayer` + `RotationSpeed` |
| "Right" sends the player the wrong way | rotate the `InputArrow` |
| Controls feel like they jerk on entry | `InputAdjustingTime`, `bInputFollowsCamera` |

---

## Programmer guide — extending the base class

`ACameraVolume` is `Abstract` and designed to be subclassed. In practice you override **one method**: `UpdateCamera`. Here is the contract you must honor.

**The tick pipeline.** The base `Tick` refreshes the input arrow, then calls `UpdateCamera` with the target point pulled through the interface:

```cpp
// CameraVolume.cpp — Tick (base)
UpdateInputArrow();
UpdateCamera(ICameraVolumesInteractor::Execute_GetTargetPointLocation(ActorInVolume), DeltaTime);

// Only the base class clears the snap flag here.
// Subclasses that move the camera in their own Tick must clear it themselves.
if (GetClass() == ACameraVolume::StaticClass())
    bShouldSnapToTarget = false;
```

**The snap-flag contract.** `bShouldSnapToTarget` means "no interpolation this update". The base class resets it only for itself; a subclass that positions the camera in its own tick is responsible for consuming and clearing it — see `AFollowSplineCamera::ApplyPosition`, which does exactly that. If you forget, your camera will snap forever.

**Separation of concerns.** Rotation (look-at) lives in the base `UpdateCamera`; position lives in your subclass. Call `Super::UpdateCamera(...)` first to inherit the look-at, then compute your position into `DesiredCameraLocation` and apply it.

**A minimal custom volume** that orbits the target at a fixed radius:

```cpp
UCLASS()
class AOrbitCamera : public ACameraVolume
{
    GENERATED_BODY()

protected:
    UPROPERTY(EditAnywhere, Category = "Configuration|Orbit")
    float Radius = 600.f;
    UPROPERTY(EditAnywhere, Category = "Configuration|Orbit")
    float InterpSpeed = 5.f;

    FVector DesiredLocation;

    virtual void Tick(float DeltaTime) override
    {
        Super::Tick(DeltaTime);   // runs UpdateInputArrow + UpdateCamera (rotation)
        ApplyPosition(DeltaTime);
    }

    virtual void UpdateCamera(FVector TargetPoint, float DeltaTime) override
    {
        Super::UpdateCamera(TargetPoint, DeltaTime);   // inherit look-at
        const FVector Dir = (GetCamera()->GetComponentLocation() - TargetPoint).GetSafeNormal2D();
        DesiredLocation = TargetPoint + Dir * Radius;
    }

    void ApplyPosition(float DeltaTime)
    {
        if (IsSnappingToTarget())
        {
            GetCamera()->SetWorldLocation(DesiredLocation);
            bShouldSnapToTarget = false;      // clear the protected flag after applying the position
        }
        else
        {
            GetCamera()->SetWorldLocation(
                FMath::VInterpTo(GetCamera()->GetComponentLocation(), DesiredLocation, DeltaTime, InterpSpeed));
        }
    }
};
```

**Changing *what* the camera follows.** The volume asks the followed actor for its focus point through the interface, so you can aim at something other than the actor's origin by overriding one function on the player:

```cpp
// Interface implemented by the player
FVector AStillHearMainCharacter::GetTargetPointLocation_Implementation()
{
    return GetActorLocation();   // override to focus a socket, an aim point, etc.
}
```

### Extension points at a glance

| You want to… | Do this |
|---|---|
| Add a new camera motion (orbit, top-down, rail…) | Subclass `ACameraVolume`, override `UpdateCamera`, apply position in `Tick`, clear `bShouldSnapToTarget` yourself. |
| Reuse look-at | Call `Super::UpdateCamera(...)` before your position logic. |
| Change the focus point | Override `GetTargetPointLocation_Implementation` on the follower. |
| React to enter/exit in a subclass | Override `BeginOverlap` / `EndOverlap` (call `Super`). |
| Author cameras without C++ | Create a Blueprint child of `ACameraVolume` (or of a spline subclass). |

---

## Gotchas & notes

- **Reset the snap flag in derived classes.** Only the base `Tick` clears `bShouldSnapToTarget`, and only for the exact base class (`GetClass() == ACameraVolume::StaticClass()`). Any subclass that moves the camera must clear it after applying position.
- **`UpdateCamera` computes, `ApplyPosition` applies.** In the spline cameras the positioning code lives in `ApplyPosition` (called from `Tick`), not inside `UpdateCamera`; `UpdateCamera` only fills `DesiredCameraLocation`. Keep that split when you subclass so snapping and interpolation stay correct.
- **`OuterVolume` is reserved.** It is created slightly larger than the inner box (`inner + 10 uu`) but currently has **no overlap events bound** — it's a placeholder for a future hysteresis band, not active logic.
- **`AStillHearCamera` is legacy.** The standalone camera actor in `Camera/StillHearCamera.*` is not part of this system and is not referenced anywhere; don't confuse it with `ACameraVolume`.
- **Deactivated volumes don't tick.** `Activate`/`Deactivate` toggle the actor tick, so only the single active volume runs per frame — keep any heavy per-frame work inside that gated tick.

---

## Related: the `CameraEffects` sub-system

Living alongside the volumes in the `Camera/` folder, `UCameraEffectsComponent` (owned by the player controller) layers **transient effects** — camera shake, FOV pulses, and positional offset kicks — on top of whatever the active volume is doing. It is fully data-driven through `FCameraEffectPreset` (shake / FOV / offset, each independently toggled) and applies FOV/offset through dedicated `UCameraModifier`s so it never overwrites the volume's base values. It is documented separately, but worth knowing it composes cleanly with the volume system rather than fighting it.
