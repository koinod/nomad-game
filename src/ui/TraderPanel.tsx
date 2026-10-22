import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { traderById, traderAccess, appraisedOffer, type BarterOffer } from '../data/traders';
import { sfx } from '../systems/audio';

// TraderPanel — barter UI for data/traders.ts. No currency: every offer is
// item-for-item, resolved against the store's public inventory API
// (countItem to check, addItem for the receive FIRST so a full pack aborts
// the trade before anything is taken, then removeItem per stack).
//
// Mounting is a world-wiring step (W3): the wiring pass opens this panel
// with a traderId when the player talks to an NPC whose placement carries
// that traderId. Until Lane 6's ItemDef.barterValue lands, offers are the
// hand-set exchange rates in traders.ts.

function stackLabel(itemId: string, qty: number): string {
  return `${ITEMS[itemId]?.name ?? itemId}${qty > 1 ? ` ×${qty}` : ''}`;
}

function canAfford(offer: BarterOffer): boolean {
  const { countItem } = useGameStore.getState();
  return offer.give.every((g) => countItem(g.itemId) >= g.qty);
}

function executeTrade(offer: BarterOffer): boolean {
  const st = useGameStore.getState();
  if (!canAfford(offer)) return false;
  // receive first: addItem returns false when the pack can't take it —
  // abort with nothing removed.
  if (!st.addItem(offer.get.itemId, offer.get.qty)) {
    st.addToast('No room for that — lighten the pack first.');
    return false;
  }
  for (const g of offer.give) {
    let remaining = g.qty;
    while (remaining > 0) {
      const stack = useGameStore.getState().inventory.find((i) => i.itemId === g.itemId);
      if (!stack) break; // cannot happen after canAfford, but stay safe
      const take = Math.min(remaining, stack.qty);
      if (!st.removeItem(stack.uid, take)) break;
      remaining -= take;
    }
    if (remaining > 0) return false; // partial failure — surfaced in report notes
  }
  sfx.play('ui');
  return true;
}

export default function TraderPanel({ traderId, onClose }: { traderId: string; onClose: () => void }) {
  const rep = useGameStore((s) => s.rep);
  const flags = useGameStore((s) => s.flags);
  const perks = useGameStore((s) => s.perks);
  const inventory = useGameStore((s) => s.inventory);
  void inventory; // re-render on inventory change so affordability updates

  const trader = traderById(traderId);
  if (!trader) return null;
  const access = traderAccess(trader, rep, flags);

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-4 pb-10 sm:items-center sm:pb-4">
      <div className="w-full max-w-2xl rounded-md border border-[#232b36] bg-[#12161c]/95 p-6 shadow-2xl">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-sm font-semibold tracking-wide text-[#e8b34b]">{trader.name}</div>
          <button
            onClick={onClose}
            className="rounded border border-[#232b36] bg-[#0b0e12] px-3 py-1 text-[13px] text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            Done
          </button>
        </div>
        {!access.ok ? (
          <p className="mt-3 text-[15px] leading-relaxed text-[#d7dde5]">{access.reason}</p>
        ) : (
          <>
            <p className="mb-4 text-[14px] italic leading-relaxed text-[#9aa6b2]">{trader.greeting}</p>
            <div className="nomad-scroll max-h-80 space-y-2 overflow-y-auto">
              {trader.offers.map((rawOffer, i) => {
                // sc_appraiser: the discounted offer is what displays,
                // what affordability checks, and what executes.
                const offer = appraisedOffer(rawOffer, perks);
                const discounted = offer.give.some((g, gi) => g.qty !== rawOffer.give[gi].qty);
                const afford = canAfford(offer);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded border border-[#232b36] bg-[#0b0e12] px-4 py-2.5"
                  >
                    <div className="text-[14px] leading-snug text-[#d7dde5]">
                      <span className="text-[#9aa6b2]">Give </span>
                      {offer.give.map((g) => stackLabel(g.itemId, g.qty)).join(' + ')}
                      <span className="text-[#9aa6b2]"> → </span>
                      {stackLabel(offer.get.itemId, offer.get.qty)}
                      {discounted ? (
                        <div className="text-[12px] text-[#5aa469]">Appraiser — your goods count for more here.</div>
                      ) : null}
                      {offer.note ? (
                        <div className="text-[12px] italic text-[#9aa6b2]">{offer.note}</div>
                      ) : null}
                    </div>
                    <button
                      disabled={!afford}
                      onClick={() => executeTrade(offer)}
                      className="shrink-0 rounded bg-[#e8b34b] px-4 py-1.5 text-[14px] font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364] disabled:cursor-not-allowed disabled:bg-[#232b36] disabled:text-[#9aa6b2]"
                    >
                      Trade
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
