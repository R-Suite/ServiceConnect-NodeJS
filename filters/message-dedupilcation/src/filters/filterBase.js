//@flow
import { Presistor } from "../presistors/presistor"

export const processIncomingMessage = async (presistor: Presistor, headers: Object): Promise<bool> => {
    try {
        return !(await presistor.messageExists(headers.MessageId));
    } catch (err) {
        throw `Error with incoming outgoing filter: ${err.Message}`;
    }
}

export const processOutgoingMessage = async (presistor: Presistor, headers: Object): Promise<bool> => {
    try {
        await presistor.insert(headers.MessageId);
        return true;
    } catch (err) {
        throw `Error with deduplication outgoing filter: ${err.Message}`;
    }
}
