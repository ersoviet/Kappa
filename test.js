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
}).then(r => r.json()).then(console.log).catch(console.error);
