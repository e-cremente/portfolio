# Input rebinding system

*Still Hear* lets you remap **every control**, on keyboard and gamepad, from a full options screen: click a row, press the new key, and the game updates the glyph, resolves conflicts, and saves the choice for future sessions. Underneath it's Unreal's **Enhanced Input** and the **Common UI** library for controller glyphs, but the remapping logic, the persistence and the UI flow are all custom-built.

This page explains how it works: the subsystem that rewrites the mapping contexts at runtime, the data model that stores the choices, the **trick for remapping WASD movement** (which is a single 2D action, not four keys), and the UI that captures the pressed key before any other system.

---

## Overview

The system splits into three layers:

| Layer | Element | Role |
|---|---|---|
| **Brain** | `UInputSubsystem` | A game-instance subsystem that loads the mapping contexts, keeps the list of current bindings, rewrites them at runtime, and saves/loads them. |
| **Data model** | `FBindingData`, `UMappingContextList`, the glyph data assets | The single binding (action + current key + default key + device), the list of contexts, and the `UCommonInputBaseControllerData` holding the glyphs for keyboard/PlayStation/Xbox. |
| **Interface** | `UBindingsPageWidgetBase` + rows + "press any key" popup | The screen: one row per action, the popup that captures the key, the Apply/Reset buttons, and conflict handling. |

The guiding principle: **nothing is hard-wired**. Default controls are read from the mapping contexts themselves on first boot, remaps are targeted edits to those contexts, and the user's choices live in a save game — not in constants in the code.

---

## The subsystem: remapping at runtime

On startup `UInputSubsystem` loads every `UInputMappingContext` from a data asset (`UMappingContextList`) and **caches the defaults**: for each mapping it builds an `FBindingData` with the action, key and device type (inferred from `IsGamepadKey`). If saved bindings exist, it applies them right away.

```cpp
// InputSubsystem.cpp — CacheDefaultBindings (condensed)
for (const auto& Mapping : MappingContext->GetMappings())
{
    FBindingData BindingData;
    BindingData.InputAction     = Mapping.Action.Get();
    BindingData.DefaultBoundKey = Mapping.Key;
    BindingData.CurrentBoundKey = Mapping.Key;
    BindingData.DeviceType = Mapping.Key.IsGamepadKey() ? EInputDeviceType::Controller
                                                        : EInputDeviceType::KeyboardMouse;
    CurrentBindings.Add(BindingData);
}
```

### Remapping = editing the mapping context, in three phases

The heart of it is rewriting the mapping context with `UnmapKey` + `MapKey`. The delicate part: if you remap keys that swap with each other, removing and re-adding one binding at a time can collide two actions on the same key mid-operation. So the remap runs in **three phases**: first *collect* everything to do (while the context is still coherent), then *remove* all the old mappings, and only then *add* the new ones.

```cpp
// InputSubsystem.cpp — RebindKeys (condensed shape)
// Phase 1: gather index and modifiers while the context is coherent
for (const auto& Binding : RebindUtilityArray) { /* find context, modifiers, index */ }

// Phase 2: FIRST remove all the old mappings
for (const FPendingRemap& R : Pending) R.Context->UnmapKey(R.Binding.InputAction, R.Binding.DefaultBoundKey);

// Phase 3: add the new ones, restoring the modifiers
for (const FPendingRemap& R : Pending)
{
    FEnhancedActionKeyMapping& NewMapping = R.Context->MapKey(R.Binding.InputAction, R.Binding.CurrentBoundKey);
    NewMapping.Modifiers = R.Modifiers;   // the modifiers must not be lost
}
```

**Preserving the modifiers is essential.** A mapping isn't just "action → key": it carries its *input modifiers* (Negate, Swizzle, Dead Zone…). Lose them in the remap and a rebound action stops behaving the way it did. The same three-phase shape also drives `ApplySavedBindings` (on startup) and `ApplyDefaultBindings` (the reset).

### Querying the state

The subsystem is also the single source of truth the UI queries:

| Function | Answer |
|---|---|
| `GetCurrentKeyForAction` | The key currently mapped to an action, for a given device. |
| `GetDefaultKeyForAction` | An action's default key. |
| `IsInputActionSetToDefault` | Whether an action is still on its factory key (to show the "Reset" button or not). |
| `GetBrushFromKey` | The right **glyph** for a key and device, via the Common UI data. |
| `GetCurrentKeyForMoveDirection` | The key for a single movement direction — see below. |

Glyphs depend on the device: keyboard, PlayStation or Xbox. `GetBrushFromKey` picks the correct `UCommonInputBaseControllerData` (keyboard, PlayStation or Xbox) based on the current controller type and pulls the key's brush from it, while `SetControllerInputType` switches the pad glyphs through the `UCommonInputSubsystem`.

---

## The WASD movement trick

Remapping keyboard movement is subtler than it looks. WASD are **not** four separate actions: they're **a single 2D action** (`Move`), and each key contributes to an axis through *input modifiers* — `Negate` flips an axis, `Swizzle` swaps X and Y. The combination of those two identifies the direction:

| Direction | Swizzle | Negate |
|---|---|---|
| Right | no | no |
| Forward | yes | no |
| Left | no | yes |
| Backward | yes | yes |

So to know which key is "forward", you don't look for a "MoveForward" action (there isn't one): you scan the `Move` action's mappings and read their modifier combination.

```cpp
// InputSubsystem.cpp — GetCurrentKeyForMoveDirection (condensed)
const bool bNegate  = HasNegateModifier(Mapping);
const bool bSwizzle = HasSwizzleModifier(Mapping);
switch (Direction)
{
case EKeyboardMoveDirection::Forward:  bMatch =  bSwizzle && !bNegate; break; // Swizzle only
case EKeyboardMoveDirection::Left:     bMatch = !bSwizzle &&  bNegate; break; // Negate only
case EKeyboardMoveDirection::Right:    bMatch = !bSwizzle && !bNegate; break; // neither
case EKeyboardMoveDirection::Backward: bMatch =  bSwizzle &&  bNegate; break; // both
}
```

A special UI row, `UKeyboardMoveRowWidget`, uses exactly this function to show the right glyph for each of the four directions, even though they all point at the same `Move` action.

---

## The UI flow

The screen (`UBindingsPageWidgetBase`) builds one row (`UBindingRowWidget`) per rebindable action, each with the control's name and the key's glyph. A remap goes like this:

```
 click a row ─► "press any key" popup
            │ (input processor, priority 0)
            ▼
     captures the key  (Esc/△ = cancel)
            │
            ▼
   pending change (PendingChanges)
       │                     │
    [Apply]               [Reset]
  RebindKeys + save     defaults + save
```

### Capturing the key before everyone else

The `UPressAnyKeyWidget` popup doesn't "listen" for keys like an ordinary widget: it registers a **Slate input processor at priority 0**, so it's the **first** to see the pressed key, before the game and the rest of the UI.

```cpp
// PressAnyKeyWidget.cpp — NativeOnActivated
InputProcessor = MakeShared<FPressAnyKeyInputProcessor>();
// priority 0 = we see the input first, no other system intercepts it before us
FSlateApplication::Get().RegisterInputPreProcessor(InputProcessor, 0);
```

The input processor captures keys, mouse and wheel, handles cancellation (Esc, or the pad's right face button), filters out the wrong device, and **always consumes the event** (returns `true`) so the pressed key doesn't fire game actions or page changes:

```cpp
// PressAnyKeyInputProcessor.cpp — ProcessKey (condensed)
if (!bReadyToCapture) return true;                         // ignore the click that opened the popup
if (Key == EKeys::Escape || Key == EKeys::Gamepad_FaceButton_Right) { OnKeySelectionCanceled.Broadcast(); return true; }
if (!bAcceptGamepadKeys && Key.IsGamepadKey())  return true;   // you're remapping the keyboard
if ( bAcceptGamepadKeys && !Key.IsGamepadKey()) return true;   // you're remapping the pad
OnKeySelected.Broadcast(Key);
return true;   // always consume the event
```

The `bReadyToCapture` flag (which only turns true on the first tick) avoids a subtle bug: without it, the *very click* that opens the popup would be captured as the new key.

### Conflicts: swap, not duplicates

When you assign a key already used by another action, the system doesn't create a duplicate: it **swaps**. The row that owned that key receives the old key, so every control stays unique.

```cpp
// BindingsPageWidgetBase.cpp — HandleKeySelected (excerpt)
for (const auto& Binding : RowWidgets)
{
    if (Binding != Row && NewKey == Binding->GetReboundKey())
    {
        Binding->SetGlyphFromKey(OldKey);          // the other row takes the old key
        Binding->SetReboundKey(OldKey);
        SetPendingChange(Binding, /*…*/ OldKey, DeviceType);
        Binding->SetCurrentKey(OldKey);
    }
}
```

### Pending until you confirm

Changes don't touch the mapping contexts right away: they pile up in a `PendingChanges` map (row → binding). Only on **Apply** are they pushed to the subsystem (`RebindKeys` + `SaveBindings`); **Reset** returns everything to defaults and saves. If you remap a key and then set it back to its original, the pending change is simply removed — no phantom change.

---

## Persistence

The bindings are an array of `FBindingData` saved in the settings save game. The subsystem exposes:

| Action | Effect |
|---|---|
| `SaveBindings` | Writes the current bindings into the save game (async). |
| `ResetSavedBindingsToDefault` | Returns the mappings to defaults **and** saves. |
| `DeleteBindings` | Clears the saved bindings. |

On startup, if the save game holds bindings, `ApplySavedBindings` restores them into the mapping contexts (with the same three-phase shape), so the user's setup survives quitting the game.

---

## Designer guide

- **Make a new action rebindable:** add the action → key mapping to the mapping context (with any modifiers), make sure the context is in the `UMappingContextList`, and add a `UBindingRowWidget` to the page, setting its `InputAction`, `DisplayText` and `DeviceType`. The default is read from the context automatically.
- **Controller glyphs:** the glyph sets for keyboard, PlayStation and Xbox are `UCommonInputBaseControllerData` (Common UI data assets) referenced by the game instance. The key icons are set directly in these assets from the editor, one per device.
- **Keyboard movement:** the four directions are `UKeyboardMoveRowWidget` rows all pointing at the `Move` action, distinguished by their `Direction` field.

---

## Programmer guide

- **Extending to per-key gamepad rebinding:** the infrastructure is already there. The input processor has `bAcceptGamepadKeys`, the popup sets it via `InitializeForDevice`, and `FBindingData` already carries the `DeviceType`. The pad isn't remapped individually today, but the path is open.
- **Respect the three phases:** any new operation that rewrites the mapping contexts must follow the *collect → remove all → add all* shape, and re-apply the original mapping's modifiers. Removing and adding one binding at a time is the road to conflicts.
- **The source of truth is the subsystem:** the UI keeps no binding state of its own — it reads from `UInputSubsystem`. When adding new widgets, query the subsystem (`GetCurrentKeyForAction`, `GetBrushFromKey`) instead of duplicating the data.

---

## Traps and notes

- **Modifiers must be re-applied on every remap.** They're the easy part to forget: without them, a rebound action loses its Negate/Swizzle/Dead Zone and changes behaviour. Every phase 3 restores them from the original mapping.
- **Priority 0 and consuming the event.** The popup must see the key first *and* consume it, or that same key would fire a game action or a page change. Both are intentional.
- **`bReadyToCapture` isn't optional.** It skips a tick before capturing, so the click that opens the popup isn't mistaken for the new key.
- **WASD is a single action.** Don't look for four movement actions: they're one 2D `Move`, and the direction is read from the modifiers. Anyone touching movement has to think in terms of Negate/Swizzle, not separate keys.
- **Changes are pending until Apply.** Until you confirm, the mapping contexts don't change: handy for cancelling, but it means the "real" state lives in `PendingChanges` until the user decides.
