// The class options of each class (the Setup screen's "<Class> options" section and its rail
// entry), selected by the spec's class id. Only the warlock exists today; another class adds its
// own entry here, so nothing else in the Setup screen names a class.

import type { ComponentType } from 'react';
import type { SetupConfig } from '../../../setup/types';
import { WarlockOptionsGroup, warlockOptionsIcon, warlockOptionsText } from '../../SetupPanel';
import type { SetupGroupProps } from '../../SetupPanel';

export interface ClassOptions {
  /** The rail's icon (a spell icon name). */
  icon(config: SetupConfig): string;
  /** The rail's value line ("Fel Armor, Succubus sacrificed"). */
  value(config: SetupConfig): string;
  /** The section's form. */
  Group: ComponentType<SetupGroupProps>;
}

const CLASS_OPTIONS: Readonly<Record<string, ClassOptions>> = {
  warlock: {
    icon: (config) => warlockOptionsIcon(config.warlock),
    value: (config) => warlockOptionsText(config.warlock),
    Group: WarlockOptionsGroup,
  },
};

/** The options of a class (`SpecIdentity.classId`), or undefined when it has none. */
export function classOptionsOf(classId: string): ClassOptions | undefined {
  return Object.hasOwn(CLASS_OPTIONS, classId) ? CLASS_OPTIONS[classId] : undefined;
}
