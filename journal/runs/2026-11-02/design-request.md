# Design request · B03 finish-panel driver list

The finish panel now lists the drivers by position ("KOSKI · #7") as plain caps labels (`ui-label`,
cream on the navy card), stacked with a 4px gap. That's all that was built. These parts were left out
because UI_RULES doesn't specify them:

- **Row layout / component:** is each results row a panel, a chip, or plain text? Should it show a
  position roundel or number, and how does it relate to the S5 results screen (B02)?
- **Player highlight:** should YOU's row be marked (rally-red is the player role, mustard marks 1st/selection)?
- **Motion:** §7 says "result rows are dealt 40ms apart, then the placing roundel stamps". That reads
  as the S5 results screen. Should the finish-panel list deal in too, and from which direction?
