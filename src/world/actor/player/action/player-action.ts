import { Player } from '@server/world/actor/player/player';
import { Position } from '@server/world/position';
import { walkToAction } from '@server/world/actor/player/action/action';
import { basicStringFilter } from '@server/plugins/plugin-loader';
import { logger } from '@runejs/core';
import { Action, questFilter, RunePlugin } from '@server/plugins/plugin';

/**
 * The definition for a player action function.
 */
export type playerAction = (playerActionData: PlayerActionData) => void;

/**
 * Details about a player being interacted with.
 */
export interface PlayerActionData {
    // The player performing the action.
    player: Player;
    // The player that the action is being performed on.
    otherPlayer: Player;
    // The position that the other player was at when the action was initiated.
    position: Position;
}

/**
 * Defines a player interaction plugin.
 * The option selected, the action to be performed, and whether or not the player must first walk to the other player.
 */
export interface PlayerAction extends Action {
    // A single option name or a list of option names that this action applies to.
    options: string | string[];
    // Whether or not the player needs to walk to the other player before performing the action.
    walkTo: boolean;
    // The action function to be performed.
    action: playerAction;
}

/**
 * A directory of all player interaction plugins.
 */
let playerActions: PlayerAction[] = [
];

/**
 * Sets the list of player interaction plugins.
 * @param actions The plugin list.
 */
export const setPlayerActions = (actions: Action[]): void => {
    playerActions = actions as PlayerAction[];
};

// @TODO priority and cancelling other (lower priority) actions
const actionHandler = (player: Player, otherPlayer: Player, position: Position, option: string): void => {
    if(player.busy) {
        return;
    }

    // Find all player action plugins that reference this option
    let interactionActions = playerActions.filter(plugin => questFilter(player, plugin) && basicStringFilter(plugin.options, option));
    const questActions = interactionActions.filter(plugin => plugin.questRequirement !== undefined);

    if(questActions.length !== 0) {
        interactionActions = questActions;
    }

    if(interactionActions.length === 0) {
        player.sendMessage(`Unhandled Player interaction: ${option} @ ${position.x},${position.y},${position.level}`);
        return;
    }

    player.actionsCancelled.next();

    // Separate out walk-to actions from immediate actions
    const walkToPlugins = interactionActions.filter(plugin => plugin.walkTo);
    const immediatePlugins = interactionActions.filter(plugin => !plugin.walkTo);

    // Make sure we walk to the other player before running any of the walk-to plugins
    if(walkToPlugins.length !== 0) {
        walkToAction(player, position)
            .then(() => {
                player.face(otherPlayer);
                walkToPlugins.forEach(plugin => plugin.action({ player, otherPlayer, position }));
            })
            .catch(() => logger.warn(`Unable to complete walk-to action.`));
    }

    // Immediately run any non-walk-to plugins
    if(immediatePlugins.length !== 0) {
        immediatePlugins.forEach(plugin => plugin.action({ player, otherPlayer, position }));
    }
};

RunePlugin.registerActionEventListener('player_action', actionHandler);
