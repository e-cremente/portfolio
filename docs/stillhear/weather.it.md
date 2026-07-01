# Sistema meteo dinamico

Il meteo di *Still Hear* è un **temporale che si accende quando serve**: il giocatore entra in un'area e comincia a piovere, il vento increspa le superfici, le nuvole si addensano in cielo di tempesta, e ogni tanto un lampo illumina la scena con un flash e un tuono. Non è un ciclo meteo globale sempre attivo: è un **volume** che i level designer piazzano dove vogliono l'atmosfera, interamente **guidato dai dati** — un solo data asset descrive *tutto* ciò che quel temporale fa, entrando e uscendo.

Questa pagina spiega com'è costruito: il volume che orchestra i quattro sottosistemi (pioggia, vento, fulmini, nuvole), il data asset "gigante" che li configura, e i **fulmini singoli** — colpi scriptati, a timer o su trigger, che possono anche elettrificare un elemento di scena.

---

## Panoramica

Il sistema ha due metà, che convivono senza dipendere l'una dall'altra:

| Metà | Classe | Ruolo |
|---|---|---|
| **Il temporale d'area** | `ARainyWeatherVolume` | Un box trigger che, quando il giocatore entra, accende pioggia + vento + fulmini ambientali + nuvole di tempesta, leggendo un `URainyWeatherDataAsset`. All'uscita, li spegne. |
| **Il fulmine singolo** | `ASingleLightningBase` (+ figli) | Un colpo di fulmine puntuale — VFX, suono, camera FX, e l'eventuale elettrificazione di un `AElectrifiedPole` — attivato a tempo o quando il giocatore entra in un trigger. |

Il tratto comune a tutto il sistema è che **non c'è quasi nulla di cablato nel codice**: il volume legge un data asset, e i valori "vivi" (parametri di materiale, variabili Niagara) passano per un catalogo di nomi centralizzato invece che per stringhe sparse.

---

## Il volume del temporale

`ARainyWeatherVolume` è un attore con un `UBoxComponent` come radice (il trigger), più i componenti che gli servono: il VFX Niagara della pioggia, un `UPostProcessComponent` per il flash, e un piano-fulmine (`LightningPlane`) con la sua area. Tutto parte da due eventi di overlap sul box:

```cpp
// RainyWeatherVolume.cpp — BeginPlay
Volume->OnComponentBeginOverlap.AddUniqueDynamic(this, &ThisClass::Activate);
Volume->OnComponentEndOverlap.AddUniqueDynamic(this, &ThisClass::Deactivate);
```

### Un orchestratore a quattro sottosistemi

Quando il giocatore entra, `Activate` accende **quattro sottosistemi indipendenti** — pioggia, vento, fulmini, nuvole — ognuno dietro il proprio interruttore nel data asset, e ognuno con l'opzione di partire **in ritardo**:

```cpp
// RainyWeatherVolume.cpp — Activate (condensato)
if (RainyWeatherDataAsset->bDelayRain)
    GetWorldTimerManager().SetTimer(RainTimerHandle, this, &ThisClass::StartRain, RainyWeatherDataAsset->RainDelayTime, false);
else
    StartRain();

if (RainyWeatherDataAsset->bActivateWind)        { /* stessa forma: delay? timer : StartWind() */ }
if (RainyWeatherDataAsset->bActivateLightnings)  { /* … TriggerLightning() */ }
if (RainyWeatherDataAsset->bModifyVolumetricClouds) { /* … ChangeVolumetricClouds() */ }
```

`Deactivate` è l'immagine speculare: spegne ogni sottosistema, di nuovo con un possibile ritardo d'uscita separato. C'è un'unica eccezione — la **modalità cinematica**: se `bCinematicMode` è attivo, uscire dal volume *non* spegne il temporale (utile quando la scena deve restare tempestosa durante una cutscene, anche se il giocatore si sposta).

### Lo schema ricorrente: ritardo, poi "smooth o secco"

Ogni sottosistema segue lo stesso schema in due passi, il che rende il sistema prevedibile da leggere e da estendere:

1. **Ritardo?** All'ingresso (e all'uscita) ogni effetto può partire subito o dopo un timer — così il tuono può precedere la pioggia, le nuvole possono addensarsi prima, ecc.
2. **Smooth o secco?** Una volta partito, l'effetto o **scatta** al valore finale, o ci **arriva con un lerp** su un tempo configurabile. Il lerp gira nel `Tick`, guidato da flag `bLerping…`.

Per la pioggia, la salita non è lineare ma **quartica**, così l'acquazzone "monta" dolcemente all'inizio e accelera verso il picco:

```cpp
// RainyWeatherVolume.cpp — LerpRain (condensato)
float Alpha = LerpingRainTime / RainyWeatherDataAsset->RainTimeToReachMaxIntensity;
Alpha = FMath::Pow(Alpha, 4);   // ease-in quartico
RainVFX->SetVariableFloat(RainyWeatherParameterNames::SpawnRate, FMath::Lerp(0, TrueMaxSpawnRate, Alpha));
RainMaterialParameterCollectionInstance->SetScalarParameterValue(RainyWeatherParameterNames::Rain,    CurrentIntensity);
RainMaterialParameterCollectionInstance->SetScalarParameterValue(RainyWeatherParameterNames::Wetness, CurrentIntensity);
```

### I quattro sottosistemi in breve

| Sottosistema | Come è realizzato |
|---|---|
| **Pioggia** | Un VFX Niagara (`SpawnRate`, `Velocity`, `SpriteSize`, `BoxSize`) più due scalari — `Rain` e `Wetness` — su una **Material Parameter Collection** condivisa, così le superfici del mondo si bagnano insieme alla pioggia. Il box della pioggia combacia col volume, o ha misure personalizzate. Può seguire il giocatore. |
| **Vento** | Uno scalare `Wind` sulla stessa MPC (piega vegetazione/superfici), con lo stesso schema ritardo + smooth. |
| **Fulmini (ambientali)** | Un piano-billboard che si riposiziona a caso nell'area, sceglie una texture a caso, si orienta verso il giocatore, e viene "acceso" da una **curva di apparizione** (`LightningPercentage`) su un materiale dinamico; opzionale un **flash a schermo** via post-process. Poi programma il prossimo colpo a un intervallo casuale. |
| **Nuvole volumetriche** | Un intero blocco di parametri su una seconda MPC (`StormClouds`, `LightningFlicker`, colori di tempesta…). I valori Unreal di default vengono letti al `BeginPlay` e poi portati ai valori di tempesta, con blend opzionale. |

### Il ciclo dei fulmini ambientali

Il fulmine ambientale è il pezzo più coreografato. A ogni colpo, `TriggerLightning` sceglie una texture e una posizione casuali nell'area, orienta il piano verso il giocatore, e (se richiesto) alza l'esposizione del post-process per il flash. Poi il `Tick` fa scorrere la curva di apparizione:

```cpp
// RainyWeatherVolume.cpp — GoThroughLightningCurve (condensato)
CurrentLightningTime += DeltaTime;
const float Alpha = RainyWeatherDataAsset->LightningAppearanceCurve->GetFloatValue(CurrentLightningTime);
LightningMaterialInstance->SetScalarParameterValue(RainyWeatherParameterNames::LightningPercentage, Alpha);

if (CurrentLightningTime >= CurveLightningTime)   // curva finita
{
    // spegni il lampo, ripristina l'esposizione, programma il prossimo colpo
    LightningMaterialInstance->SetScalarParameterValue(RainyWeatherParameterNames::LightningPercentage, /* -1 = invisibile */);
    SetNextLightningTime();   // RandRange(Min, Max)
}
```

Tra un colpo e l'altro, se il temporale segue il giocatore, l'area dei fulmini gli si sposta dietro; durante il colpo resta ferma, così il lampo non "scivola".

---

## Il data asset "gigante"

Tutto quel comportamento è configurato da un unico `URainyWeatherDataAsset`. È deliberatamente grande — decine di proprietà — ma **ordinato per intento** e, soprattutto, **auto-filtrante**: quasi ogni campo ha un `EditCondition` che lo mostra solo quando è rilevante. Attivi `bActivateWind`? Compaiono i campi del vento. Spunti `bDelayRain`? Appare il tempo di ritardo. Così il designer non naviga mai in un muro di proprietà spente.

```cpp
// RainyWeatherDataAsset.h — le proprietà si auto-nascondono in base ai flag
UPROPERTY(EditDefaultsOnly, Category = "Enter|Wind",
    meta = (EditCondition = "bActivateWind && bDelayWind", EditConditionHides, ClampMin = "0.0"))
float WindDelayTime;
```

Le categorie raccontano da sole la struttura:

| Categoria | Cosa contiene |
|---|---|
| `Configuration` | Segui-giocatore, offset di pioggia e fulmini. |
| `Enter\|Rain` · `Enter\|Wind` | Intensità massima, ritardo, smooth-in, spawn rate, velocità, dimensioni. |
| `Enter\|Lightnings` | Colore, curva di apparizione, intervallo min/max fra colpi, flash a schermo. |
| `Enter\|Clouds` | I parametri di tempesta delle nuvole volumetriche (scalari e colori). |
| `Exit\|…` | Per ogni sottosistema, i suoi ritardi e smooth **d'uscita**, separati da quelli d'ingresso. |

La divisione **Enter / Exit** è la chiave: entrare e uscire non sono simmetrici per forza — la pioggia può montare in fretta e poi scemare piano, i fulmini possono spegnersi subito mentre le nuvole si diradano con calma.

### Nomi dei parametri centralizzati

I materiali e i VFX si pilotano per nome. Invece di sparpagliare stringhe magiche nel codice, tutti i nomi vivono in un unico posto, `RainyWeatherParameterNames`:

```cpp
// RainyWeatherParameterNames.h
namespace RainyWeatherParameterNames
{
    inline const FName SpawnRate  = "SpawnRate";     // variabile Niagara
    inline const FName Rain       = "Rain";          // MPC pioggia
    inline const FName Wetness    = "Wetness";
    inline const FName StormClouds = "StormClouds";  // MPC nuvole
    // …
}
```

È lo stesso principio del catalogo delle chiavi di blackboard dei nemici: un nome sbagliato o rinominato si corregge in un punto solo, e non c'è modo che C++ e asset vadano fuori sincrono in silenzio.

---

## I fulmini singoli

Accanto ai fulmini *ambientali* del temporale ci sono i fulmini **singoli**: colpi puntuali e scriptati, indipendenti dal volume. Servono per i momenti "grossi" — un lampo che cade su un punto preciso, con tuono, scossone di camera, e magari un elemento di scena che si elettrifica.

`ASingleLightningBase` (astratta) contiene tutto ciò che *un* fulmine fa quando scatta:

```cpp
// SingleLightningBase.cpp — TriggerLightning (condensato)
LightningVfx->Activate(true);                 // il VFX del fulmine
if (Pole) Pole->StartEffect();                // elettrifica il palo collegato
// SFX (eventualmente ritardato per far arrivare il tuono dopo il lampo)
// e un preset di CameraEffects: shake / FOV / offset
CachedCameraEffectComponent->PlayEffectPreset(CameraEffects);
```

Il ritardo del suono è un tocco di realismo: il **lampo si vede subito, il tuono arriva dopo** (`SoundDelayTime`). Il camera preset riusa lo stesso sotto-sistema `CameraEffects` del resto del gioco, così un fulmine "si sente" anche nella regia.

Da questa base derivano due modi di innescare il colpo:

| Classe | Innesco |
|---|---|
| `ASingleLightningTimer` | A tempo: un intervallo fisso, oppure casuale tra `MinTime` e `MaxTime`, che si riprogramma da sé a ogni colpo. |
| `ASingleLightningTrigger` | Su contatto: un box che, quando il giocatore ci entra, spara **una volta** e poi si disabilita. |

### Il palo elettrificato

`AElectrifiedPole` è un piccolo attore-elemento: una mesh più un VFX Niagara elettrico spento. Un fulmine singolo lo può referenziare e "accendere":

```cpp
// ElectrifiedPole.cpp
void AElectrifiedPole::StartEffect() { ElectricEffect->Activate(true); }
```

È l'aggancio che trasforma un fulmine da puro effetto atmosferico a **beat di gameplay/scena**: il colpo cade, il palo si elettrifica, e il resto del livello può reagire.

---

## Guida per il designer

Per un temporale d'area:

1. **Piazza il volume.** Trascina un `ARainyWeatherVolume` nel livello e scala il box per coprire l'area del temporale.
2. **Assegna gli asset.** Collega un `RainyWeatherDataAsset`, le due **Material Parameter Collection** (pioggia e nuvole) e l'array di texture dei fulmini.
3. **Configura il data asset.** Accendi solo i sottosistemi che vuoi (`bActivateWind`, `bActivateLightnings`, `bModifyVolumetricClouds`); i campi irrilevanti si nascondono da soli. Tara intensità, ritardi e tempi di smooth, separando ingresso e uscita.
4. **Cutscene?** Attiva `bCinematicMode` per tenere il temporale acceso anche se il giocatore lascia il volume.
5. **Debug.** Attiva `bShowAreaExtents` sul data asset per vedere a schermo le aree di pioggia e fulmini mentre le tari (il volume ticca anche nel viewport dell'editor, così vedi le modifiche dal vivo).

Per un fulmine singolo: piazza un `ASingleLightningTimer` (per colpi ricorrenti d'atmosfera) o un `ASingleLightningTrigger` (per un colpo scriptato all'arrivo del giocatore), assegna VFX/SFX, il preset di camera, il `SoundDelayTime` per lo stacco lampo-tuono, e — se serve — collega un `AElectrifiedPole`.

**Checklist rapida**

| Obiettivo | Dove intervenire |
|---|---|
| Pioggia più/meno intensa | `RainMaxIntensity`, `RainMaxSpawnRate` |
| Il temporale "monta" invece di scattare | `bSmoothRainIntensity` + `RainTimeToReachMaxIntensity` |
| Fulmini più frequenti | `Min`/`MaxTimeBetweenLightnings` |
| Flash del lampo a schermo | `bScreenFlash` + `PostProcessExposureDuringLightning` |
| Tuono in ritardo sul lampo | `SoundDelayTime` (fulmine singolo) |
| Meteo che resta in cutscene | `bCinematicMode` sul volume |

---

## Guida per il programmatore

- **Aggiungere un sottosistema** (es. nebbia): segui lo schema esistente — un flag `bActivate…` + eventuale ritardo nel data asset, una `Start…`/`Stop…` chiamata da `Activate`/`Deactivate`, e (se serve smooth) un `Lerp…` guidato da un flag nel `Tick`. Metti i nomi dei parametri in `RainyWeatherParameterNames`.
- **Un nuovo tipo di fulmine singolo**: sottoclassa `ASingleLightningBase` e fai l'override di `TriggerLightning` (chiamando `Super`) per il tuo innesco — sul modello di `Timer` e `Trigger`.
- **Pilotare il mondo dal meteo**: i valori scalari/vettoriali passano per le Material Parameter Collection, quindi qualsiasi materiale che le legge (terreno, vegetazione, superfici) reagisce automaticamente a pioggia, vento e tempesta senza codice aggiuntivo.

---

## Trappole e note

- **Il volume ticca sempre, anche nell'editor.** `ShouldTickIfViewportsOnly` è `true` di proposito, per l'anteprima dal vivo e i box di debug; ma vuol dire che il lavoro per-frame (lerp, curva del fulmine) va tenuto snello.
- **Ingresso e uscita sono indipendenti.** Non dare per scontato che uscire sia il contrario esatto di entrare: hanno ritardi e smooth separati, ed esiste `bCinematicMode` che salta del tutto la disattivazione.
- **Ambientale ≠ singolo.** I fulmini del volume (piano billboard su curva, ciclici) e i fulmini singoli (VFX Niagara, scriptati, con palo) sono due sistemi distinti: non confonderli quando aggiungi un colpo per un momento specifico — quasi sempre vuoi un `ASingleLightning*`.
- **Le Material Parameter Collection sono globali.** Scrivere sui loro scalari cambia *tutti* i materiali che le usano: è esattamente ciò che rende il mondo "bagnato" insieme, ma tieni presente che due volumi meteo attivi contemporaneamente si contendono la stessa MPC.
