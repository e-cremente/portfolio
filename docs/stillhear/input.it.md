# Sistema di rebinding dei comandi

*Still Hear* lascia rimappare **ogni comando**, da tastiera e da gamepad, con una schermata di opzioni completa: clicchi una riga, premi il tasto nuovo, e il gioco aggiorna il glifo, gestisce i conflitti, e salva la scelta per le partite successive. Sotto c'è l'**Enhanced Input** di Unreal e la libreria **Common UI** per i glifi dei controller, ma la logica di rimappatura, la persistenza e il flusso della UI sono costruiti su misura.

Questa pagina spiega come funziona: il subsystem che riscrive i mapping context a runtime, il modello dati che salva le scelte, il **trucco per rimappare il movimento WASD** (che è una singola azione 2D, non quattro tasti), e la UI che cattura il tasto premuto prima di ogni altro sistema.

---

## Panoramica

Il sistema si divide in tre strati:

| Strato | Elemento | Ruolo |
|---|---|---|
| **Cervello** | `UInputSubsystem` | Un game-instance subsystem che carica i mapping context, tiene la lista delle binding correnti, le riscrive a runtime, e le salva/carica. |
| **Modello dati** | `FBindingData`, `UMappingContextList`, i data asset dei glifi | La singola binding (azione + tasto attuale + tasto di default + dispositivo), la lista dei context, e i `UCommonInputBaseControllerData` con i glifi per tastiera/PlayStation/Xbox. |
| **Interfaccia** | `UBindingsPageWidgetBase` + righe + popup "premi un tasto" | La schermata: una riga per azione, il popup che cattura il tasto, i pulsanti Applica/Reset, e la gestione dei conflitti. |

Il principio guida: **niente è cablato**. I comandi di default vengono letti dai mapping context stessi al primo avvio, le rimappature sono modifiche mirate a quei context, e le scelte dell'utente vivono in un save game — non in costanti nel codice.

---

## Il subsystem: rimappare a runtime

`UInputSubsystem` all'avvio carica tutti gli `UInputMappingContext` da un data asset (`UMappingContextList`) e ne fa la **cache dei default**: per ogni mapping crea una `FBindingData` con azione, tasto e tipo di dispositivo (dedotto da `IsGamepadKey`). Se esistono binding salvate, le applica subito.

```cpp
// InputSubsystem.cpp — CacheDefaultBindings (condensato)
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

### Rimappare = modificare il mapping context, in tre fasi

Il cuore è la riscrittura del mapping context con `UnmapKey` + `MapKey`. Il punto delicato: se rimappi tasti che si scambiano tra loro, togliere e rimettere una binding alla volta può far collidere due azioni sullo stesso tasto a metà operazione. Per questo la rimappatura è **in tre fasi**: prima si *raccoglie* tutto ciò che va fatto (mentre il context è ancora coerente), poi si *rimuovono* tutti i vecchi mapping, e solo dopo si *aggiungono* i nuovi.

```cpp
// InputSubsystem.cpp — RebindKeys (schema condensato)
// Fase 1: raccogli index e modifier finché il context è coerente
for (const auto& Binding : RebindUtilityArray) { /* trova context, modifier, indice */ }

// Fase 2: rimuovi PRIMA tutti i vecchi mapping
for (const FPendingRemap& R : Pending) R.Context->UnmapKey(R.Binding.InputAction, R.Binding.DefaultBoundKey);

// Fase 3: aggiungi i nuovi, ripristinando i modifier
for (const FPendingRemap& R : Pending)
{
    FEnhancedActionKeyMapping& NewMapping = R.Context->MapKey(R.Binding.InputAction, R.Binding.CurrentBoundKey);
    NewMapping.Modifiers = R.Modifiers;   // i modifier non vanno persi
}
```

**Preservare i modifier è essenziale.** Un mapping non è solo "azione → tasto": porta con sé i suoi *input modifier* (Negate, Swizzle, Dead Zone…). Se li perdessimo nella rimappatura, un'azione rimappata smetterebbe di comportarsi come prima. Lo stesso schema a tre fasi regge anche `ApplySavedBindings` (all'avvio) e `ApplyDefaultBindings` (il reset).

### Interrogare lo stato

Il subsystem è anche l'unica fonte di verità che la UI interroga:

| Funzione | Risposta |
|---|---|
| `GetCurrentKeyForAction` | Il tasto attualmente mappato su un'azione, per un dato dispositivo. |
| `GetDefaultKeyForAction` | Il tasto di default di un'azione. |
| `IsInputActionSetToDefault` | Se un'azione è ancora sul suo tasto di fabbrica (per mostrare o meno il tasto "Reset"). |
| `GetBrushFromKey` | Il **glifo** giusto per un tasto e un dispositivo, via i dati Common UI. |
| `GetCurrentKeyForMoveDirection` | Il tasto di una singola direzione del movimento — vedi sotto. |

I glifi dipendono dal dispositivo: tastiera, PlayStation o Xbox. `GetBrushFromKey` sceglie il `UCommonInputBaseControllerData` corretto (tastiera, PlayStation o Xbox) in base al tipo di controller corrente e ne ricava il brush del tasto, mentre `SetControllerInputType` commuta i glifi del pad tramite il `UCommonInputSubsystem`.

---

## Il trucco del movimento WASD

Rimappare il movimento da tastiera è più sottile di quanto sembri. WASD **non** sono quattro azioni separate: sono **una singola azione 2D** (`Move`), e ogni tasto contribuisce a un asse tramite gli *input modifier* — `Negate` inverte un asse, `Swizzle` scambia X e Y. La combinazione di questi due identifica la direzione:

| Direzione | Swizzle | Negate |
|---|---|---|
| Destra | no | no |
| Avanti | sì | no |
| Sinistra | no | sì |
| Indietro | sì | sì |

Così, per sapere quale tasto è "avanti", non si cerca un'azione "MoveForward" (non esiste): si scorrono i mapping dell'azione `Move` e si legge la loro combinazione di modifier.

```cpp
// InputSubsystem.cpp — GetCurrentKeyForMoveDirection (condensato)
const bool bNegate  = HasNegateModifier(Mapping);
const bool bSwizzle = HasSwizzleModifier(Mapping);
switch (Direction)
{
case EKeyboardMoveDirection::Forward:  bMatch =  bSwizzle && !bNegate; break; // solo Swizzle
case EKeyboardMoveDirection::Left:     bMatch = !bSwizzle &&  bNegate; break; // solo Negate
case EKeyboardMoveDirection::Right:    bMatch = !bSwizzle && !bNegate; break; // nessuno
case EKeyboardMoveDirection::Backward: bMatch =  bSwizzle &&  bNegate; break; // entrambi
}
```

Una riga speciale della UI, `UKeyboardMoveRowWidget`, usa proprio questa funzione per mostrare il glifo giusto di ciascuna delle quattro direzioni, pur puntando tutte alla stessa azione `Move`.

---

## Il flusso della UI

La schermata (`UBindingsPageWidgetBase`) costruisce una riga (`UBindingRowWidget`) per ogni azione rimappabile, ciascuna con il nome del comando e il glifo del tasto. Il giro di una rimappatura:

```
 click su una riga ─► popup "premi un tasto"
                │ (input processor, priorità 0)
                ▼
         cattura il tasto  (Esc/△ = annulla)
                │
                ▼
    modifica in sospeso (PendingChanges)
        │                        │
    [Applica]                 [Reset]
  RebindKeys + salva       default + salva
```

### Catturare il tasto prima di tutti

Il popup `UPressAnyKeyWidget` non "ascolta" i tasti come un widget qualsiasi: registra un **input processor di Slate a priorità 0**, così è il **primo** a vedere il tasto premuto, prima del gioco e del resto della UI.

```cpp
// PressAnyKeyWidget.cpp — NativeOnActivated
InputProcessor = MakeShared<FPressAnyKeyInputProcessor>();
// priorità 0 = siamo i primi a vedere l'input, nessun altro sistema lo intercetta prima
FSlateApplication::Get().RegisterInputPreProcessor(InputProcessor, 0);
```

L'input processor cattura tasti, mouse e rotellina, gestisce l'annullamento (Esc, o il tasto destro del pad), filtra il dispositivo sbagliato, e **consuma sempre l'evento** (ritorna `true`) così il tasto premuto non fa scattare azioni di gioco né cambi di pagina:

```cpp
// PressAnyKeyInputProcessor.cpp — ProcessKey (condensato)
if (!bReadyToCapture) return true;                         // ignora il click che ha aperto il popup
if (Key == EKeys::Escape || Key == EKeys::Gamepad_FaceButton_Right) { OnKeySelectionCanceled.Broadcast(); return true; }
if (!bAcceptGamepadKeys && Key.IsGamepadKey())  return true;   // stai rimappando la tastiera
if ( bAcceptGamepadKeys && !Key.IsGamepadKey()) return true;   // stai rimappando il pad
OnKeySelected.Broadcast(Key);
return true;   // consuma sempre l'evento
```

Il flag `bReadyToCapture` (che diventa vero solo al primo tick) evita un bug sottile: senza, il *click stesso* che apre il popup verrebbe catturato come nuovo tasto.

### Conflitti: scambio, non doppioni

Quando assegni un tasto già usato da un'altra azione, il sistema non crea un doppione: **scambia**. La riga che possedeva quel tasto riceve il tasto vecchio, così ogni comando resta univoco.

```cpp
// BindingsPageWidgetBase.cpp — HandleKeySelected (estratto)
for (const auto& Binding : RowWidgets)
{
    if (Binding != Row && NewKey == Binding->GetReboundKey())
    {
        Binding->SetGlyphFromKey(OldKey);          // l'altra riga prende il tasto vecchio
        Binding->SetReboundKey(OldKey);
        SetPendingChange(Binding, /*…*/ OldKey, DeviceType);
        Binding->SetCurrentKey(OldKey);
    }
}
```

### In sospeso finché non confermi

Le modifiche non toccano subito i mapping context: si accumulano in una mappa `PendingChanges` (riga → binding). Solo su **Applica** vengono spinte al subsystem (`RebindKeys` + `SaveBindings`); **Reset** riporta tutto ai default e salva. Se rimappi un tasto e poi lo riporti al valore originale, la modifica in sospeso viene semplicemente rimossa — nessun cambiamento fittizio.

---

## Persistenza

Le binding sono un array di `FBindingData` salvato nel save game delle impostazioni. Il subsystem espone:

| Azione | Effetto |
|---|---|
| `SaveBindings` | Scrive le binding correnti nel save game (async). |
| `ResetSavedBindingsToDefault` | Riporta i mapping ai default **e** salva. |
| `DeleteBindings` | Svuota le binding salvate. |

All'avvio, se il save game contiene delle binding, `ApplySavedBindings` le riporta nei mapping context (con lo stesso schema a tre fasi), così la configurazione dell'utente sopravvive alla chiusura del gioco.

---

## Guida per il designer

- **Rendere rimappabile una nuova azione:** aggiungi il mapping azione → tasto nel mapping context (con gli eventuali modifier), assicurati che il context sia nella `UMappingContextList`, e aggiungi una `UBindingRowWidget` alla pagina impostando la sua `InputAction`, il `DisplayText` e il `DeviceType`. Il default viene letto da solo dal context.
- **Glifi dei controller:** i set di glifi per tastiera, PlayStation e Xbox sono `UCommonInputBaseControllerData` (data asset di Common UI) referenziati dalla game instance. Le icone dei tasti si impostano direttamente in questi asset dall'editor, uno per dispositivo.
- **Movimento tastiera:** le quattro direzioni sono righe `UKeyboardMoveRowWidget` che puntano tutte all'azione `Move`, distinte dal campo `Direction`.

---

## Guida per il programmatore

- **Estendere al rebinding del gamepad tasto-per-tasto:** l'infrastruttura c'è già. L'input processor ha `bAcceptGamepadKeys`, il popup lo imposta via `InitializeForDevice`, e la `FBindingData` porta già il `DeviceType`. Oggi il pad non si rimappa singolarmente, ma la strada è aperta.
- **Rispettare le tre fasi:** qualsiasi nuova operazione che riscrive i mapping context deve seguire lo schema *raccogli → rimuovi tutti → aggiungi tutti*, e ri-applicare i modifier del mapping originale. Rimuovere e aggiungere una binding alla volta è la strada verso i conflitti.
- **La sorgente di verità è il subsystem:** la UI non tiene stato di binding suo — legge da `UInputSubsystem`. Aggiungendo nuovi widget, interroga il subsystem (`GetCurrentKeyForAction`, `GetBrushFromKey`) invece di duplicare i dati.

---

## Trappole e note

- **I modifier vanno ri-applicati a ogni rimappatura.** Sono la parte che è facile dimenticare: senza, un'azione rimappata perde il suo Negate/Swizzle/Dead Zone e cambia comportamento. Ogni fase 3 li ripristina dal mapping originale.
- **Priorità 0 e consumo dell'evento.** Il popup deve vedere il tasto per primo *e* consumarlo, altrimenti quello stesso tasto farebbe partire un'azione di gioco o un cambio di pagina. Entrambe le cose sono volute.
- **`bReadyToCapture` non è opzionale.** Salta un tick prima di catturare, così il click che apre il popup non viene scambiato per il nuovo tasto.
- **WASD è una sola azione.** Non cercare quattro azioni di movimento: sono una `Move` 2D, e la direzione si legge dai modifier. Chi tocca il movimento deve ragionare in termini di Negate/Swizzle, non di tasti separati.
- **Le modifiche sono in sospeso fino ad Applica.** Finché non si conferma, i mapping context non cambiano: comodo per annullare, ma vuol dire che lo stato "vero" vive in `PendingChanges` finché l'utente non decide.
