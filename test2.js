const fs = require('fs');
const q = `query GetBlocked($lang: LanguageCode, $gameMode: GameMode) {
  traders(lang: $lang, gameMode: $gameMode) {
    id name
    levels { level requiredPlayerLevel requiredReputation }
    cashOffers {
      minTraderLevel
      taskUnlock { id name }
      item { id name shortName iconLink basePrice }
    }
  }
}`;
fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { lang: 'es', gameMode: 'regular' } })
})
    .then(r => r.json())
    .then(res => {
        let data = res.data;
        const itemsMap = new Map();

        data.traders.forEach(trader => {
            const processOffer = (offer, isBarter) => {
                if (!offer.taskUnlock && !offer.minTraderLevel && !offer.level) return;
                const items = isBarter ? (offer.rewardItems || []).map(r => r.item) : (offer.item ? [offer.item] : []);

                items.forEach(item => {
                    if (!item || !item.id) return;
                    const reqLevel = offer.minTraderLevel || offer.level || 1;
                    const traderLvlData = trader.levels.find(l => l.level === reqLevel) || { requiredPlayerLevel: 1 };

                    if (!itemsMap.has(item.id)) {
                        itemsMap.set(item.id, {
                            ...item,
                            unlocks: []
                        });
                    }

                    const existing = itemsMap.get(item.id);
                    // Add this unlock path if unique
                    if (!existing.unlocks.some(u => u.trader.id === trader.id && u.level === reqLevel && (u.task ? u.task.id === offer.taskUnlock?.id : !offer.taskUnlock))) {
                        existing.unlocks.push({
                            trader: { id: trader.id, name: trader.name },
                            level: reqLevel,
                            playerLevel: traderLvlData.requiredPlayerLevel,
                            task: offer.taskUnlock
                        });
                    }
                });
            };
            if (trader.cashOffers) trader.cashOffers.forEach(o => processOffer(o, false));
            if (trader.barters) trader.barters.forEach(o => processOffer(o, true));
        });

        let blockedItemsData = Array.from(itemsMap.values()).filter(i => i.unlocks.length > 0);
        console.log("Found items:", blockedItemsData.length);
    })
    .catch(console.error);
