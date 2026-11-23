/**
 * AVIEW, Equipment picker: a dropdown of what an Agent can wear in place of its Weapon or Armor: the one it wears,
 * then every Item of that kind with at least one in Storage, from the highest number down, and last the Fallback
 * Weapon or Fallback Armor. Choosing another row equips the Agent with it in one Player action, without confirmation.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AgentView, CurrentLiveWorldStateView, EquipmentItemView } from '../../engine/index.ts';
import { act, theEngine } from '../store.ts';
import { AmmoWarning, ArmorIcon, SwordIcon } from './equipment-icons.tsx';

interface Option {
  readonly id: string;
  readonly name: string;
  readonly stat: number;
  readonly worn: boolean;
  readonly available: number | null;
  readonly ammo: EquipmentItemView | null;
}

function optionsOf(agent: AgentView, kind: 'weapon' | 'armor', state: CurrentLiveWorldStateView): Option[] {
  const view = state.agency.equipment;
  const ammoOf = (id: string | null) =>
    id === null ? null : (view.items.find((item) => item.id === id) ?? null);
  const wornId = kind === 'weapon' ? agent.weapon : agent.armor;
  const worn: Option = {
    id: wornId,
    name: kind === 'weapon' ? agent.weaponName : agent.armorName,
    stat: kind === 'weapon' ? agent.baseWeaponDamage : agent.baseArmor,
    worn: true,
    available: null,
    ammo: kind === 'weapon' ? ammoOf(agent.weaponAmmoType) : null,
  };
  const stored = view.items
    .filter((item) => item.kind === kind && item.available > 0 && item.id !== wornId)
    .sort((x, y) => (y.stat ?? 0) - (x.stat ?? 0))
    .map((item) => ({
      id: item.id,
      name: item.name,
      stat: item.stat ?? 0,
      worn: false,
      available: item.available,
      ammo: ammoOf(item.ammoType),
    }));
  const fallbackId = kind === 'weapon' ? view.fallbackWeapon : view.fallbackArmor;
  const fallback: Option[] =
    fallbackId === wornId
      ? []
      : [
          {
            id: fallbackId,
            name: kind === 'weapon' ? view.fallbackWeaponName : view.fallbackArmorName,
            stat: kind === 'weapon' ? view.fallbackWeaponDamage : view.fallbackArmorValue,
            worn: false,
            available: null,
            ammo: null,
          },
        ];
  return [worn, ...stored, ...fallback];
}

/** AVIEW, Weapon and Armor cells: the name, the number, and its icon, with the Ammo short warning on a Weapon. */
export function EquipmentText(props: { agent: AgentView; kind: 'weapon' | 'armor' }) {
  const { agent, kind } = props;
  return (
    <>
      {kind === 'weapon' ? agent.weaponName : agent.armorName}{' '}
      <span className="figure">{kind === 'weapon' ? agent.baseWeaponDamage : agent.baseArmor}</span>
      {kind === 'weapon' ? <SwordIcon /> : <ArmorIcon />}
      {kind === 'weapon' && agent.ammoShort ? <AmmoWarning title="Ammo short" /> : null}
    </>
  );
}

export function EquipmentPicker(props: {
  agent: AgentView;
  kind: 'weapon' | 'armor';
  state: CurrentLiveWorldStateView;
  locked: string | null;
  testId?: string;
}) {
  const { player } = theEngine();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;
  const root = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) !== true && list.current?.contains(target) !== true) {
        setAnchor(null);
      }
    };
    // The list is fixed to the window, so it closes when what it hangs from moves.
    const dismiss = (event: Event) => {
      if (list.current?.contains(event.target as Node) !== true) {
        setAnchor(null);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);
  const options = open ? optionsOf(props.agent, props.kind, props.state) : [];
  // The list hangs in a layer over the whole window, so that a table's scroll box, e.g. the Agents table's, never clips
  // it. It opens below the cell, or above it when there is more room there.
  const below = anchor === null || window.innerHeight - anchor.bottom >= Math.min(anchor.top, 260);
  const placement: CSSProperties =
    anchor === null
      ? {}
      : below
        ? { position: 'fixed', top: anchor.bottom + 4, left: anchor.left }
        : { position: 'fixed', bottom: window.innerHeight - anchor.top + 4, left: anchor.left, top: 'auto' };
  return (
    <span className="equipment-picker" ref={root}>
      <button
        type="button"
        className="equipment-cell"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={props.locked !== null}
        title={props.locked ?? undefined}
        data-testid={props.testId}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(open ? null : event.currentTarget.getBoundingClientRect());
        }}
      >
        <EquipmentText agent={props.agent} kind={props.kind} />
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open
        ? createPortal(
            <span
              ref={list}
              className="equipment-options"
              style={placement}
              role="listbox"
              aria-label={`${props.kind === 'weapon' ? 'Weapon' : 'Armor'} for ${props.agent.id}`}
            >
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.worn}
                  className={option.worn ? 'worn' : undefined}
                  data-testid={`equip-${props.agent.id}-${option.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAnchor(null);
                    if (!option.worn) {
                      act(() => player.actions.equipAgent(props.agent.id, option.id));
                    }
                  }}
                >
                  <span>{option.name}</span>
                  <span className="figure">
                    {option.stat}
                    {props.kind === 'weapon' ? <SwordIcon /> : <ArmorIcon />}
                  </span>
                  <span className="secondary">
                    {props.kind === 'weapon'
                      ? option.ammo === null
                        ? 'no ammo'
                        : `${option.ammo.name} ${option.ammo.available}`
                      : ''}
                    {option.ammo?.ammoShort === true ? (
                      <AmmoWarning title={`${option.ammo.name} short`} />
                    ) : null}
                  </span>
                  <span className="muted small">
                    {option.worn ? 'worn' : option.available === null ? '' : `${option.available} in store`}
                  </span>
                </button>
              ))}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
