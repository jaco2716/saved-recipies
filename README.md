# 🍳 Mine opskrifter

En simpel hjemmeside til at gemme og læse mine opskrifter. Bygget i ren HTML og
CSS — ingen programmer eller opsætning nødvendig. Fungerer fint på både mobil og
computer.

## Sådan ser du hjemmesiden

- **På computeren:** Åbn `index.html` i din browser.
- **På mobilen (via GitHub Pages):** Se afsnittet nedenfor for at få et link, du
  altid kan åbne på telefonen.

## Sådan tilføjer du en ny opskrift

1. Gå ind i mappen `opskrifter/`.
2. Kopiér filen `skabelon.html`, og giv kopien et nyt navn, fx `lasagne.html`.
3. Åbn den nye fil, og udfyld titel, ingredienser og fremgangsmåde.
4. Åbn `index.html`, og tilføj et nyt punkt i listen, der linker til din nye
   opskrift:

   ```html
   <li>
     <a href="opskrifter/lasagne.html">
       <span class="title">Lasagne</span>
       <span class="desc">Klassisk lasagne med kødsovs</span>
     </a>
   </li>
   ```

5. Gem filerne, og upload (commit + push) til dit repo.

## Struktur

```
├── index.html          # Forside med oversigt over alle opskrifter
├── style.css           # Fælles styling til alle sider
├── README.md           # Denne vejledning
└── opskrifter/
    ├── skabelon.html   # Skabelon du kopierer til nye opskrifter
    ├── pandekager.html # Eksempel-opskrift
    └── boller.html     # Eksempel-opskrift
```

## Se hjemmesiden på mobilen med GitHub Pages (gratis)

Så kan du åbne dine opskrifter fra hvor som helst — bare gem linket på
telefonens hjemmeskærm.

1. Gå til dit repo på GitHub.
2. Klik på **Settings** → **Pages**.
3. Under **Source** vælg **Deploy from a branch**.
4. Vælg branch (fx `main`) og mappen `/ (root)`, og tryk **Save**.
5. Efter et øjeblik får du et link i stil med
   `https://<dit-brugernavn>.github.io/saved-recipies/`.
6. Åbn linket på mobilen, og læg det på hjemmeskærmen for hurtig adgang.
