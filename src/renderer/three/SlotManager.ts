import * as THREE from 'three'

interface SlotAttachment {
  group: THREE.Group
  parent: THREE.Object3D
}

export class SlotManager {
  private slots = new Map<string, SlotAttachment>()

  attachSlot(slotId: string, group: THREE.Group, parent: THREE.Object3D): void {
    this.detachSlot(slotId)
    parent.add(group)
    this.slots.set(slotId, { group, parent })
  }

  detachSlot(slotId: string): void {
    const existing = this.slots.get(slotId)
    if (existing) {
      existing.parent.remove(existing.group)
      this.slots.delete(slotId)
    }
  }

  setSlotVisibility(slotId: string, visible: boolean): void {
    const existing = this.slots.get(slotId)
    if (existing) {
      existing.group.visible = visible
    }
  }

  getAttachedSlot(slotId: string): THREE.Group | undefined {
    return this.slots.get(slotId)?.group
  }

  dispose(): void {
    for (const [slotId] of this.slots) {
      this.detachSlot(slotId)
    }
  }
}
