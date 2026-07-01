# Gameplay Ability System & abilities

*Still Hear* builds **the character's entire gameplay on top of Unreal's Gameplay Ability System (GAS)**: jumping, sprinting, crouching, climbing, vaulting, the parry, interactions — each is its own *gameplay ability*, activated by a tag and able to apply effects, play montages, wait for events and clean up after itself.

My work here had two layers. First I **stood up the GAS foundation for the whole team** — the base classes, the ability system component, the attributes, the tag infrastructure and the usage conventions — after researching how to structure it so it would hold up for the player, the companion and the enemies alike. Then, on top of that foundation, I **authored a portion of the player's abilities**: all of the movement (jump, sprint, crouch) and all of the traversal (climbing and getting over low obstacles).

This page explains how the base is built, which conventions I set for the team, and how the abilities I made work in detail — with usage notes for designers and programmers.

---

## Overview

The system is layered, from most generic to most specific:

| Layer | Class / element | Responsibility |
|---|---|---|
| **Engine** | `UStillHearAbilitySystemComponent` | The project's ability system component (ASC): owns an actor's attributes, effects and abilities, and notifies when the ability list changes. |
| **Ability contract** | `UStillHearGameplayAbility` | The base class of **every** ability in the game: sets the common tags, the instancing policy, and fixes a UE 5.5 tag-blocking bug. |
| **Carrier** | `AStillHearCharacterBase` | The base character class: owns the ASC, grants starting abilities, and translates movement events into GAS tags/events. |
| **Numeric state** | `UBasicAttributeSet` | The attributes (speed, multiplier, parry angle) and the pipeline that turns them into values on the `CharacterMovement`. |
| **Vocabulary** | Native gameplay tag catalog | The shared tag taxonomy (`GameplayAbility.*`, `Status.*`, `Event.*`, `Data.*`, `GameplayCue.*`…) the whole system talks over. |

The core idea: an ability never knows another ability directly. Everything flows through **tags** (who's active, who's blocked, who requires what) and **gameplay events** (input released, animation notify, collision activated). This keeps the system extensible without touching existing code.

---

## The foundation's architecture

### The Ability System Component

`UStillHearAbilitySystemComponent` extends the standard ASC and adds one focused thing: it **notices when an actor's abilities change** (granted or removed) and fires an event, so anyone interested — typically the UI — can update without polling.

```cpp
// StillHearAbilitySystemComponent.cpp — OnRep_ActivateAbilities (condensed)
// Compare the current list against a snapshot taken last time:
// if the count differs, or any entry differs, the abilities changed.
if (LastActivatableAbility.Num() != ActivatableAbilities.Items.Num())
{
    Character->SendAbilitiesChangedEvent();
    LastActivatableAbility = ActivatableAbilities.Items;
}
```

### The ability base class

`UStillHearGameplayAbility` is the **common contract** inherited by every ability. Its constructor sets the defaults that apply to all of them:

```cpp
// StillHearGameplayAbility.cpp
UStillHearGameplayAbility::UStillHearGameplayAbility()
{
    ActivationOwnedTags.AddTag(TAG_GameplayAbility_Active);   // "I'm active right now"
    ActivationBlockedTags.AddTag(TAG_Status_Death);           // dead → activate nothing
    InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
}
```

But the part worth telling is the **fix for a Unreal Engine 5.5 bug**. UE 5.5 introduced a regression: if you put a **parent** tag (e.g. `GameplayAbility.MainCharacter`) into the *Block Abilities With Tag* list, the block no longer triggers for child abilities (e.g. `GameplayAbility.MainCharacter.Jump`), whereas earlier versions handled it correctly. For our design that's a real problem, because — as shown below — many abilities block by tag *family*.

So I overrode `DoesAbilitySatisfyTagRequirements`, fixing the offending check:

```cpp
// StillHearGameplayAbility.cpp — inside the blocked-tag check
// The original line was !ContainerA.HasAny(ContainerB), which inverted the
// parent/child relationship. The corrected version queries the containers the right way:
if (ContainerA.IsEmpty() || ContainerB.IsEmpty() || !ContainerB.HasAny(ContainerA))
    return;   // no tags in common → not blocked
```

> **Why it matters:** the traversal abilities (`Climb`, `LowVault`, `LowGetOnTop`) block the whole `GameplayAbility.MainCharacter` family with a single tag, instead of listing every ability to inhibit one by one. Without this fix, on UE 5.5 that parent-tag block would silently do nothing.

### The carrier: `AStillHearCharacterBase`

It's the base class shared by the player, the companion and the enemies. It implements `IAbilitySystemInterface`, creates and owns the ASC, and handles the **ability lifecycle**:

```cpp
// StillHearCharacterBase.cpp — PossessedBy
AbilitySystemComponent->InitAbilityActorInfo(this, this);

if (!bStartingAbilitiesGranted)      // guard against re-possession (e.g. an AI re-possessing the pawn)
{
    GrantAbilities(StartingAbilities);
    bStartingAbilitiesGranted = true;
}
```

The `bStartingAbilitiesGranted` guard avoids a subtle bug: without it, a second `PossessedBy` (common with AI controllers) would grant the same abilities again, creating duplicate specs and firing the events that trigger them twice.

The base class also translates **movement state** into GAS language, so abilities can reason in tags instead of querying the `CharacterMovement`:

```cpp
// StillHearCharacterBase.cpp — OnMovementModeChanged
if (GetCharacterMovement()->MovementMode == MOVE_Falling)
    AbilitySystemComponent->AddLooseGameplayTag(TAG_Status_Falling);
else if (PrevMovementMode == MOVE_Falling)
    AbilitySystemComponent->RemoveLooseGameplayTag(TAG_Status_Falling);
```

| Method | What it's for |
|---|---|
| `GrantAbilities` / `RemoveAbilities` | Grants/removes abilities at runtime and notifies the change. |
| `SendAbilitiesChangedEvent` | Fires `Event.Abilities.Changed` (used by the UI). |
| `SendGameplayEventToSelf` | Helper to send yourself a gameplay event (e.g. physical crouch end). |
| `OnMovementModeChanged` | Keeps `Status.Falling` aligned to the real state. |
| `OnEndCrouch` | Notifies `Event.MainCharacter.EndCrouch` when the capsule actually stands back up. |

### Attributes and speed

`UBasicAttributeSet` holds the few numeric values abilities modulate. The heart of it is the **speed pipeline**: `BaseSpeed` and `SpeedMultiplier` are two separate attributes, and whenever either changes the set recomputes the effective speed and writes it straight onto movement.

```cpp
// BasicAttributeSet.cpp
void UBasicAttributeSet::UpdateCharacterSpeed(float Base, float Multiplier) const
{
    const float FinalSpeed = Base * Multiplier;
    Character->GetCharacterMovement()->MaxWalkSpeed = FinalSpeed;
    Character->GetCharacterMovement()->MaxFlySpeed  = FinalSpeed;
}
```

The payoff is that an ability like Sprint never touches movement by hand: it applies a **Gameplay Effect** that raises `SpeedMultiplier`, and the pipeline does the rest. When the effect is removed, speed returns to base on its own.

| Attribute | Default | Meaning |
|---|---|---|
| `BaseSpeed` | `600` | Base walk speed. |
| `SpeedMultiplier` | `1.0` | Multiplier applied by effects (sprint, slows…). |
| `MaxParryAngle` | — | Maximum useful angle for the parry logic. |

### The tag vocabulary

The whole system communicates through a taxonomy of native gameplay tags, organized by intent. It's the shared infrastructure every ability rests on:

| Family | Example | Use |
|---|---|---|
| `GameplayAbility.*` | `GameplayAbility.MainCharacter.Jump` | Ability identity (asset tag) and block/cancel by family. |
| `….Active` | `GameplayAbility.MainCharacter.Sprint.Active` | "This ability is active right now" (activation owned tag). |
| `Status.*` | `Status.Falling`, `Status.MainCharacter.Crouched` | Current actor state. |
| `Event.*` | `Event.InputReleased.Sprint`, `Event.Collision.Activate` | One-shot signals abilities wait on. |
| `Data.*` | `Data.MainCharacter.ParryCooldown` | *SetByCaller* keys to inject values into effects. |
| `GameplayCue.*` | `GameplayCue.MainCharacter.Parry` | Hook for replicable audio/visual feedback. |

---

## Conventions I set for the team

So several people could add abilities without stepping on each other, I fixed — and communicated to the group — a set of recurring conventions. They're the "skeleton" every ability in the project follows:

1. **One ability = one asset tag + its `.Active` twin.** The ability declares itself with `SetAssetTags(GameplayAbility.X)` and, while running, owns `GameplayAbility.X.Active`. That lets others block it, cancel it, or query it by tag.
2. **Activate by class.** The character activates abilities with `TryActivateAbilityByClass(...)`, keeping input decoupled from the ability's internal logic.
3. **Button release is an event, not a poll.** "Hold" abilities (Sprint, Crouch) stay active until they receive their `Event.InputReleased.*` through a `WaitGameplayEvent`.
4. **Animations talk through events.** AnimNotifies send gameplay events (e.g. `Event.Collision.Activate`) to sync logic with the montage's key frames, instead of eyeballed timers.
5. **"Live" numbers go through SetByCaller.** Durations and cooldowns aren't hard-wired into the effect: they're injected with `SetSetByCallerMagnitude(Data.X, value)` read from a data asset, so designers tune them without touching code.
6. **Every ability cleans up in `EndAbility`.** Applied effects, cues, delegate bindings and movement changes are always undone on exit, whether the ability finished or was cancelled.

---

## The abilities I built

The player abilities I wrote fall into two groups: the **movement/state modifiers** (Jump, Sprint, Crouch) and the **montage-driven traversal** (Climb, LowVault, LowGetOnTop).

### Movement and state modifiers

| Ability | Trigger | Mechanic | Blocks / cancels |
|---|---|---|---|
| `GA_Jump` | Jump press | Checks `PersonalizedCanJump()`, jumps, applies a GE granting the "in air" state, plays force feedback, and stays active until movement returns to `MOVE_Walking`. | Blocks **all** `GameplayAbility` while airborne. |
| `GA_Sprint` | Sprint press | Computes the `SprintSpeed / BaseSpeed` multiplier and applies a GE on `SpeedMultiplier`; waits for `Event.InputReleased.Sprint` to end. | Blocks and cancels Crouch. |
| `GA_Crouch` | Crouch press | `Character->Crouch()` + a `Status.MainCharacter.Crouched` state GE, with a cooldown injected via SetByCaller; waits for `Event.InputReleased.Crouch`. | Self-blocks while active or while the "crouched" state is present. |

**Jump** shows the "wait for an event instead of ticking" pattern well. It doesn't count airborne frames: it applies the state and delegates the ending to a task.

```cpp
// GA_Jump.cpp — ActivateAbility (condensed)
MainCharacter->Jump();
Asc->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data);   // "in air" state

// The ability ends itself once the character lands again
UAbilityTask_WaitMovementModeChange* Task =
    UAbilityTask_WaitMovementModeChange::CreateWaitMovementModeChange(this, MOVE_Walking);
Task->OnChange.AddDynamic(this, &UGA_Jump::OnMovementModeChange);
Task->ReadyForActivation();
```

**Sprint** is the canonical example of how much the attribute pipeline simplifies things: the ability never touches `MaxWalkSpeed`, it only applies an effect on the multiplier.

```cpp
// GA_Sprint.cpp — apply the multiplier via SetByCaller
const float Multiplier = Character->SprintSpeed / Character->BaseSpeed;
SpecHandle.Data->SetSetByCallerMagnitude(
    FGameplayTag::RequestGameplayTag("Data.SpeedMultiplier"), Multiplier);
Asc->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data);
// In EndAbility: RemoveActiveGameplayEffectBySourceEffect(...) → speed returns to base
```

**Crouch** adds a cooldown handled in `ApplyCooldown`, where the duration value isn't hard-wired but read from a data asset and injected into the effect:

```cpp
// GA_Crouch.cpp — ApplyCooldown
SpecHandle.Data->SetSetByCallerMagnitude(
    TAG_Data_MainCharacter_CrouchCooldown, AbilityData->CooldownDuration);
```

### Traversal: montage + motion warping

The three traversal abilities share the same scaffolding, and they're the ones that leaned hardest on the parent-tag fix. The common pattern:

1. **They isolate the character from the physical world** for the animation's duration: they disable the capsule's collision response to `WorldStatic` and switch to `MOVE_Flying`, so movement is driven by the montage, not by physics.
2. **They place a motion-warping target** (`Climb`, `Landing`, `GetUp`) taken from a reference point computed on the character, so the montage "latches onto" the ledge or landing surface precisely, regardless of where the animation starts.
3. **They play the montage** with `PlayMontageAndWait` and end the ability on complete/interrupt/cancel, restoring collisions, movement mode and foot IK in `EndAbility`.

```cpp
// GA_Climb.cpp — ActivateAbility (condensed)
Character->GetCharacterMovement()->StopMovementImmediately();
Character->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
Character->GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Ignore);
Character->SetAnimationClimbing(true);      // disable the foot IK trace during the climb

Character->MotionWarping->AddOrUpdateWarpTargetFromLocation(
    FName("Climb"), Character->GetMotionWarpTarget());

// PlayMontageAndWait → OnCompleted/OnInterrupted/OnCancelled all call EndAbility
```

| Ability | Warp target | Notable |
|---|---|---|
| `GA_Climb` | `Climb` | Wall climb. Blocks the `GameplayAbility.MainCharacter` family, cancels Jump. |
| `GA_LowVault` | `Landing` | Vaults over a low obstacle. Re-positions the character to the right height relative to the wall, and **re-enables collisions mid-animation** when it receives `Event.Collision.Activate` (sent by an AnimNotify on the frame where the feet have cleared the obstacle). |
| `GA_LowGetOnTop` | `GetUp` | Climbs *on top* of a low obstacle and stays there. |

In `LowVault` the sync is driven by the animation itself: collisions aren't re-enabled after an arbitrary timer, but exactly on the frame the animation calls for, because the animation signals it.

```cpp
// GA_LowVault.cpp — collision returns when the anim says so
void UGA_LowVault::OnCollisionActivateEventReceived(FGameplayEventData Payload)
{
    Character->GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Block);
}
```

### A contribution: the Parry

I **contributed** to the Parry, but it isn't entirely mine — it was a team effort. It's still worth describing its shape, because it's the ability that ties the most pieces of the system together at once.

The Parry opens a **timing window** during a montage: at the right moment (signalled by an AnimNotify via `Event.Collision.Activate`) it activates a collision sphere around the character, looks for tagged enemies inside it, and applies a **stun** effect to whatever it finds. A successful parry triggers a sensory package — time dilation through a `TimeManagementSubsystem`, camera FX, strong force feedback — and grants a brief **invulnerability**, at the end of which the cooldown starts. It's a good example of how, on this foundation, a single ability can orchestrate collision, effects, cues, feedback and state without ever leaving the framework.

---

## What else this foundation carries

The foundation described above doesn't only serve the abilities I wrote: **all of the game's gameplay rests on it.** The same skeleton runs other player and companion abilities built by the team — **Resonance** (a timed match with resonant objects), **death** as a state that cancels and blocks everything, the **Tap/Hold interactions** (which navigate to the nearest object and start/stop its use) and the companion's **SoundWave** (aim, on-screen target switching and firing a sound projectile).

The **enemies** live on this same base too: the shared character class applies to them just as it does to the player, and their abilities follow the same conventions. That part — starting from the enemy base class and the worm, which I built entirely — is covered in the dedicated enemies page.

---

## Designer guide — configuring an ability

Abilities are C++ classes, but almost everything you need to tune them is exposed to data:

1. **Grant it.** Add the ability class to the character's `StartingAbilities` array (or grant it at runtime with `GrantAbilities`). It's given automatically on possession.
2. **Tune the numbers.** Durations, cooldowns, radii and the like live in the ability's **data assets** (e.g. `CrouchData`, `ParryData`), not in code. Change them there: they're injected into effects via SetByCaller.
3. **State/speed effects.** Abilities that modulate speed apply a Gameplay Effect on `SpeedMultiplier` — set the magnitude in the effect; the attribute pipeline writes the value onto movement for you.
4. **Montages and warps.** For traversal abilities, assign the right `Montage` and make sure it contains the expected AnimNotifies (e.g. the one that sends `Event.Collision.Activate` in `LowVault`) and warp targets with the correct names (`Climb`, `Landing`, `GetUp`).
5. **Feedback.** Cues (`GameplayCue.*`), camera FX presets and force feedback are referenced in the ability's data assets: you can swap them without touching logic.

**Quick checklist**

| Goal | Where to act |
|---|---|
| Give/remove an ability | `StartingAbilities` or `GrantAbilities`/`RemoveAbilities` |
| Change a cooldown or duration | The ability's data asset (SetByCaller value) |
| Change how fast sprint is | `SprintSpeed` on the character + the multiplier effect |
| Sync an action with the animation | AnimNotify that sends the expected gameplay event |
| Change an ability's VFX/SFX | Cue / preset in the data asset |

---

## Programmer guide — authoring a new ability

Every ability inherits from `UStillHearGameplayAbility` and follows the same shape. A minimal skeleton:

```cpp
UGA_MyAbility::UGA_MyAbility()
{
    FGameplayTagContainer AssetTags;
    AssetTags.AddTag(TAG_GameplayAbility_MainCharacter_MyAbility);   // identity
    SetAssetTags(AssetTags);

    ActivationOwnedTags.AddTag(TAG_GameplayAbility_MainCharacter_MyAbility_Active); // "I'm active"
    // BlockAbilitiesWithTag / CancelAbilitiesWithTag: by tag family, thanks to the 5.5 fix
}

void UGA_MyAbility::ActivateAbility(...)
{
    Super::ActivateAbility(...);
    // 1. validate avatar / data; if something's missing, EndAbility(..., bWasCancelled=true)
    // 2. apply effects / start montages / enable collisions
    // 3. start an AbilityTask that waits for the end condition (event, montage, movement mode)
}

void UGA_MyAbility::EndAbility(...)
{
    // ALWAYS undo everything ActivateAbility set up:
    // RemoveActiveGameplayEffectBySourceEffect, remove cues, restore movement/collisions
    Super::EndAbility(...);
}
```

### Extension points at a glance

| If you want to… | Do this |
|---|---|
| Modulate speed | Apply a GE on `SpeedMultiplier` (don't touch `MaxWalkSpeed` by hand). |
| Block a whole ability family | Add the parent tag to `BlockAbilitiesWithTag` (works thanks to the `DoesAbilitySatisfyTagRequirements` fix). |
| End on a button release | `WaitGameplayEvent` on the relevant `Event.InputReleased.*`. |
| Sync with an animation frame | AnimNotify that sends a gameplay event, awaited with `WaitGameplayEvent`. |
| Inject durations/cooldowns from data | `SetSetByCallerMagnitude(Data.X, value)` read from a data asset. |
| Know whether the character is airborne | Read the `Status.Falling` tag instead of querying movement. |

---

## Traps and notes

- **The parent-tag fix is essential, not cosmetic.** On UE 5.5, without the `DoesAbilitySatisfyTagRequirements` override, blocking by a parent tag (`GameplayAbility.MainCharacter`) fails silently. Several traversal abilities rely on that block: if the engine is ever upgraded, verify the bug is still present before removing the override.
- **Grant abilities exactly once.** The `bStartingAbilitiesGranted` guard exists because `PossessedBy` can be called more than once (controller re-possession): without it, you get duplicate specs and events that trigger the ability twice.
- **Clean up in `EndAbility`, always.** Every applied effect must be removed with `RemoveActiveGameplayEffectBySourceEffect` (or by handle), every cue removed, every collision/movement-mode change restored — even when the ability is cancelled, not only when it ends on its own.
- **Speed is only touched via effects.** Writing `MaxWalkSpeed` by hand bypasses the pipeline and creates inconsistent state: any speed modulation must go through a GE on `SpeedMultiplier`.
- **`MOVE_Flying` during traversal is intentional.** The climb/vault abilities switch to flying and disable capsule collisions on purpose, to let the montage drive; the restore happens in `EndAbility` (and, for `LowVault`, collision already returns mid-animation via an event).
