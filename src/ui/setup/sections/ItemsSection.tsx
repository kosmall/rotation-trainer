import { itemRowOf } from '../../../setup/gearEffects';
import { ITEM_SLOT_KEYS } from '../../keys';
import { ItemsGroup } from '../../SetupPanel';
import { SpellIcon } from '../../SpellIcon';
import { useTrainer } from '../../state/TrainerProvider';
import { SetupCard, SetupSectionFrame } from './SectionHead';

/** The next fight's item bar (Z X C V B N): the bound item actions in order, the free keys empty. */
function ItemBarPreview() {
  const { state } = useTrainer();
  const bound = itemRowOf(state.nextFight.catalog, new Set(state.config.enabledBuffs)).bound;
  return (
    <ol className="item-bar-preview" aria-label="Item bar of the next fight">
      {ITEM_SLOT_KEYS.map((key, i) => {
        const b = bound[i];
        return (
          <li key={key} className={b ? 'ibp-slot' : 'ibp-slot ibp-empty'} title={b?.name}>
            <kbd>{key.toUpperCase()}</kbd>
            {b ? (
              <>
                <SpellIcon kind={b.iconKind === 'item' ? 'item' : 'spell'} icon={b.icon} className="ibp-icon" />
                <span className="ibp-name">{b.name}</span>
              </>
            ) : (
              <span className="ibp-name">Empty</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Items & cooldowns: the item bar preview, the worn gear's effects, the potions and the rune. */
export function ItemsSection() {
  const { state, actions, meta } = useTrainer();
  return (
    <SetupSectionFrame
      section="items"
      title="Items & cooldowns"
      description="The on-use and proc effects of your gear, the potions and the rune. What is on the item bar, you press in the fight."
    >
      <ItemBarPreview />
      <SetupCard title="Items and cooldowns" width="full">
        <ItemsGroup
          catalog={state.nextFight.catalog}
          config={state.config}
          onChange={actions.changeConfig}
          pending={meta.pending.gear}
          fightEnded={meta.phase === 'ended'}
          unmodelledItemEffects={state.unmodelledItemEffects}
          itemsNote={state.itemsNote}
        />
      </SetupCard>
    </SetupSectionFrame>
  );
}
