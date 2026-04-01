"""Action type schemas derived from ai-parse.ts tool definitions.

Each schema defines required fields, field types, and valid enum values
for validation and scoring.
"""

from __future__ import annotations

# All valid action types from ProposedActionType in src/types/definitions.ts
# Note: ai-parse.ts tool names use plural forms (add_batches, assign_trimmers, etc.)
# but the executor maps them to singular action types. This maps both.
ALL_ACTION_TYPES = frozenset([
    "create_session", "add_batch", "add_batches",
    "assign_trimmer", "assign_trimmers",
    "add_trimmer_profile", "add_trimmer_profiles",
    "create_harvest", "record_wet_weight", "allocate_harvest",
    "record_harvest_waste", "move_harvest", "delete_harvest", "update_harvest",
    "record_plant_weight", "flag_contamination",
    "submit_harvest_batch", "approve_harvest_day",
    "convert_to_trim",
    "create_human_task", "create_human_tasks",
    "update_human_task", "update_human_tasks",
    "delete_human_task", "delete_human_tasks",
    "delete_batch", "change_batch_status",
    "submit_session", "remove_trimmer", "delete_trimmer_profile",
    "update_trimmer", "update_plant_health",
    "create_planting", "move_plants", "change_plant_phase", "destroy_plants",
    "create_strain", "delete_strain",
    "create_license", "delete_license",
    "import_tags", "assign_tag", "auto_assign_tags",
    "create_package", "create_packages",
    "update_package", "finish_package", "delete_package",
    "record_extraction",
    "create_room", "update_room", "delete_room",
])

# Workflow categories for intent classification
WORKFLOW_CATEGORIES = {
    "trim": [
        "create_session", "add_batch", "add_batches",
        "assign_trimmer", "assign_trimmers",
        "add_trimmer_profile", "add_trimmer_profiles",
        "delete_batch", "change_batch_status", "submit_session",
        "remove_trimmer", "delete_trimmer_profile", "update_trimmer",
        "convert_to_trim",
    ],
    "harvest": [
        "create_harvest", "record_wet_weight", "allocate_harvest",
        "record_harvest_waste", "move_harvest", "delete_harvest", "update_harvest",
        "record_plant_weight", "flag_contamination",
        "submit_harvest_batch", "approve_harvest_day",
    ],
    "cultivation": [
        "create_planting", "move_plants", "change_plant_phase",
        "destroy_plants", "update_plant_health",
    ],
    "extraction": [
        "record_extraction",
    ],
    "packages": [
        "create_package", "create_packages",
        "update_package", "finish_package", "delete_package",
    ],
    "tasks": [
        "create_human_task", "create_human_tasks",
        "update_human_task", "update_human_tasks",
        "delete_human_task", "delete_human_tasks",
    ],
    "reference": [
        "create_strain", "delete_strain",
        "create_license", "delete_license",
        "create_room", "update_room", "delete_room",
        "import_tags", "assign_tag", "auto_assign_tags",
    ],
}

# Reverse lookup: action type -> workflow category
ACTION_TO_WORKFLOW: dict[str, str] = {}
for _cat, _types in WORKFLOW_CATEGORIES.items():
    for _t in _types:
        ACTION_TO_WORKFLOW[_t] = _cat


# --- Field type definitions ---

def _str(description: str = "") -> dict:
    return {"type": "string", "description": description}

def _num(description: str = "", unit: str = "grams") -> dict:
    return {"type": "number", "description": description, "unit": unit}

def _enum(values: list[str], description: str = "") -> dict:
    return {"type": "enum", "values": values, "description": description}

def _arr(item_type: str = "string", description: str = "") -> dict:
    return {"type": "array", "item_type": item_type, "description": description}


# --- Action schemas (from ai-parse.ts tool definitions) ---

ACTION_SCHEMAS: dict[str, dict] = {
    # ── Trim Session ──
    "create_session": {
        "required": ["harvestName", "strain", "licenseNumber", "startWeight"],
        "fields": {
            "harvestName": _str("Harvest batch name"),
            "strain": _str("Cannabis strain"),
            "licenseNumber": _str("License number"),
            "startWeight": _num("Starting weight"),
        },
    },
    "add_batches": {
        "required": ["batches"],
        "fields": {
            "batches": _arr("object", "Array of batch objects"),
        },
    },
    "assign_trimmers": {
        "required": ["entryIdentifier", "trimmers"],
        "fields": {
            "entryIdentifier": _str("Harvest name or strain"),
            "trimmers": _arr("object", "Array of trimmer assignments"),
        },
    },
    "add_trimmer_profiles": {
        "required": ["profiles"],
        "fields": {
            "profiles": _arr("object", "Array of profile objects"),
        },
    },
    "delete_batch": {
        "required": ["entryIdentifier"],
        "fields": {
            "entryIdentifier": _str("Harvest name or strain"),
        },
    },
    "change_batch_status": {
        "required": ["entryIdentifier", "newStatus"],
        "fields": {
            "entryIdentifier": _str("Harvest name or strain"),
            "newStatus": _enum(["active", "submitted", "upcoming"]),
        },
    },
    "submit_session": {
        "required": [],
        "fields": {},
    },
    "remove_trimmer": {
        "required": ["entryIdentifier", "trimmerName"],
        "fields": {
            "entryIdentifier": _str("Harvest name or strain"),
            "trimmerName": _str("Trimmer name"),
        },
    },
    "delete_trimmer_profile": {
        "required": ["profileName"],
        "fields": {
            "profileName": _str("Profile name"),
        },
    },
    "update_trimmer": {
        "required": ["entryIdentifier", "trimmerName"],
        "fields": {
            "entryIdentifier": _str("Harvest name or strain"),
            "trimmerName": _str("Trimmer name"),
            "startTime": _str("HH:mm format"),
            "endTime": _str("HH:mm format"),
            "tool": _enum(["scissors", "machine"]),
            "flowerWeight": _num("Flower weight"),
            "shakeWeight": _num("Shake weight"),
            "trimWeight": _num("Trim weight"),
            "wasteWeight": _num("Waste weight"),
        },
    },

    # ── Harvest ──
    "create_harvest": {
        "required": ["strain", "licenseNumber", "allocation"],
        "fields": {
            "strain": _str("Cannabis strain"),
            "licenseNumber": _str("License number"),
            "allocation": _enum(["Flower", "Frozen", "Both"]),
            "name": _str("Custom batch ID"),
            "plantCount": _num("Number of plants", unit="count"),
            "dryingLocation": _str("Drying location"),
            "targetWeight": _num("Fresh frozen target weight"),
        },
    },
    "record_wet_weight": {
        "required": ["harvestIdentifier", "weight"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "weight": _num("Wet weight"),
        },
    },
    "allocate_harvest": {
        "required": ["harvestIdentifier", "allocations"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "allocations": _arr("object", "Array of allocation objects"),
        },
    },
    "record_harvest_waste": {
        "required": ["harvestIdentifier", "wasteType", "weight"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "wasteType": _enum([
                "powdery_mildew", "bud_rot", "insects", "other",
                "stems", "leaves", "plant_material", "fibrous", "root_ball",
            ]),
            "weight": _num("Waste weight"),
        },
    },
    "record_plant_weight": {
        "required": ["harvestIdentifier", "weights"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "weights": _arr("object", "Array of {plantNumber?, weight}"),
        },
    },
    "flag_contamination": {
        "required": ["harvestIdentifier", "contaminants"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "contaminants": _arr("string", "Contamination types"),
        },
    },
    "move_harvest": {
        "required": ["harvestIdentifier", "dryingLocation"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "dryingLocation": _str("New drying location"),
        },
    },
    "delete_harvest": {
        "required": ["harvestIdentifier"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
        },
    },
    "update_harvest": {
        "required": ["harvestIdentifier"],
        "fields": {
            "harvestIdentifier": _str("Batch ID or strain"),
            "strain": _str("Updated strain"),
            "name": _str("Updated batch ID"),
            "plantCount": _num("Updated plant count", unit="count"),
            "dryingLocation": _str("Updated drying location"),
        },
    },

    # ── Cultivation / Plants ──
    "update_plant_health": {
        "required": ["plantIdentifier"],
        "fields": {
            "plantIdentifier": _str("Strain or room name"),
            "roomName": _str("Room name"),
            "health": _num("Health score 0-100", unit="score"),
            "contaminants": _arr("string", "Contaminant list"),
            "note": _str("Optional note"),
        },
    },
    "create_planting": {
        "required": ["type", "strainName", "roomName", "count"],
        "fields": {
            "type": _enum(["batch", "plant"]),
            "strainName": _str("Strain name"),
            "roomName": _str("Room name"),
            "count": _num("Number of plants", unit="count"),
            "batchType": _enum(["clone", "seed", "tissue_culture"]),
            "batchName": _str("Batch name"),
            "growthPhase": _enum(["vegetative", "flowering"]),
            "labelPrefix": _str("Label prefix"),
        },
    },
    "move_plants": {
        "required": ["targetRoomName"],
        "fields": {
            "plantIds": _arr("string", "Plant/batch IDs"),
            "entityType": _enum(["plants", "plantbatches"]),
            "targetRoomName": _str("Destination room"),
            "strain": _str("Strain filter"),
            "sourceRoomName": _str("Source room"),
        },
    },
    "change_plant_phase": {
        "required": ["targetPhase"],
        "fields": {
            "plantIds": _arr("string", "Plant IDs"),
            "targetPhase": _enum(["vegetative", "flowering", "harvested", "destroyed"]),
            "targetRoomName": _str("Optional destination room"),
            "strain": _str("Strain filter"),
            "sourceRoomName": _str("Source room"),
        },
    },
    "destroy_plants": {
        "required": [],
        "fields": {
            "plantIds": _arr("string", "Plant/batch IDs"),
            "entityType": _enum(["plants", "plantbatches"]),
            "strain": _str("Strain filter"),
            "roomName": _str("Room filter"),
        },
    },

    # ── Human Tasks ──
    "create_human_tasks": {
        "required": ["tasks"],
        "fields": {
            "tasks": _arr("object", "Array of task objects"),
        },
    },
    "update_human_tasks": {
        "required": ["updates"],
        "fields": {
            "updates": _arr("object", "Array of task update objects"),
        },
    },
    "delete_human_tasks": {
        "required": ["deletions"],
        "fields": {
            "deletions": _arr("object", "Array of task deletion objects"),
        },
    },

    # ── Reference Data ──
    "create_strain": {
        "required": ["name"],
        "fields": {
            "name": _str("Strain name"),
        },
    },
    "delete_strain": {
        "required": [],
        "fields": {
            "strainId": _str("Strain ID"),
            "strainName": _str("Strain name"),
        },
    },
    "create_license": {
        "required": ["licenseNumber"],
        "fields": {
            "licenseNumber": _str("License number"),
            "label": _str("Friendly label"),
        },
    },
    "delete_license": {
        "required": [],
        "fields": {
            "licenseId": _str("License ID"),
            "licenseNumber": _str("License number"),
        },
    },
    "create_room": {
        "required": ["name"],
        "fields": {
            "name": _str("Room name"),
            "roomType": _enum(["nursery", "veg", "flower", "dry", "general"]),
            "capacity": _num("Plant capacity", unit="count"),
            "squareFootage": _num("Square footage", unit="sqft"),
            "notes": _str("Notes"),
        },
    },
    "update_room": {
        "required": ["roomName"],
        "fields": {
            "roomName": _str("Current room name"),
            "name": _str("New name"),
            "roomType": _enum(["nursery", "veg", "flower", "dry", "general"]),
            "capacity": _num("New capacity", unit="count"),
            "squareFootage": _num("New square footage", unit="sqft"),
            "notes": _str("New notes"),
        },
    },
    "delete_room": {
        "required": ["roomName"],
        "fields": {
            "roomName": _str("Room name"),
        },
    },
    "import_tags": {
        "required": ["tagNumbers"],
        "fields": {
            "tagNumbers": _arr("string", "Tag number strings"),
            "tagType": _enum(["plant", "batch"]),
        },
    },
    "assign_tag": {
        "required": ["tagNumber"],
        "fields": {
            "tagNumber": _str("Tag number"),
            "plantIdentifier": _str("Plant label or strain"),
            "roomName": _str("Room filter"),
        },
    },
    "auto_assign_tags": {
        "required": [],
        "fields": {
            "strain": _str("Strain filter"),
            "roomName": _str("Room filter"),
            "count": _num("Number of tags", unit="count"),
        },
    },

    # ── Packages ──
    "create_packages": {
        "required": ["packages"],
        "fields": {
            "packages": _arr("object", "Array of package objects"),
        },
    },
    "update_package": {
        "required": ["packageIdentifier"],
        "fields": {
            "packageIdentifier": _str("Package label"),
            "status": _enum(["active", "on_hold", "finished"]),
            "location": _str("New location"),
            "labTestingState": _enum(["not_submitted", "submitted", "passed", "failed"]),
            "notes": _str("Updated notes"),
        },
    },
    "finish_package": {
        "required": ["packageIdentifier"],
        "fields": {
            "packageIdentifier": _str("Package label"),
        },
    },
    "delete_package": {
        "required": ["packageIdentifier"],
        "fields": {
            "packageIdentifier": _str("Package label"),
        },
    },

    # ── Extraction ──
    "record_extraction": {
        "required": ["strain", "inputPackageType", "outputPackageType"],
        "fields": {
            "strain": _str("Cannabis strain"),
            "inputPackageType": _enum(["fresh_frozen", "bubble_hash", "rosin"]),
            "inputQuantity": _num("Input material consumed"),
            "outputPackageType": _enum(["bubble_hash", "rosin", "rosin_cart"]),
            "outputQuantity": _num("Output produced"),
            "outputLabel": _str("Output package label"),
            "licenseNumber": _str("License number"),
            "wasteWeight": _num("Waste produced"),
            "notes": _str("Process notes"),
        },
    },

    # ── Convert to Trim ──
    "convert_to_trim": {
        "required": [],
        "fields": {
            "allocationId": _str("Harvest allocation ID"),
            "harvestIdentifier": _str("Harvest batch ID or strain"),
        },
    },
}

# Aliases: singular forms map to the same schema
_ALIASES = {
    "add_batch": "add_batches",
    "assign_trimmer": "assign_trimmers",
    "add_trimmer_profile": "add_trimmer_profiles",
    "create_human_task": "create_human_tasks",
    "update_human_task": "update_human_tasks",
    "delete_human_task": "delete_human_tasks",
    "create_package": "create_packages",
}


def get_schema(action_type: str) -> dict | None:
    """Get the schema for an action type, resolving aliases."""
    canonical = _ALIASES.get(action_type, action_type)
    return ACTION_SCHEMAS.get(canonical)


def validate_action(action: dict) -> list[str]:
    """Validate an action dict against its schema. Returns list of errors."""
    errors: list[str] = []
    action_type = action.get("type", "")
    data = action.get("data", {})

    if action_type not in ALL_ACTION_TYPES:
        errors.append(f"Unknown action type: {action_type}")
        return errors

    schema = get_schema(action_type)
    if schema is None:
        errors.append(f"No schema defined for: {action_type}")
        return errors

    for field in schema["required"]:
        if field not in data or data[field] is None:
            errors.append(f"Missing required field '{field}' for {action_type}")

    for field, value in data.items():
        if field not in schema["fields"]:
            continue  # extra fields are allowed (Claude may add context)

        field_def = schema["fields"][field]
        if field_def["type"] == "enum" and value not in field_def.get("values", []):
            errors.append(
                f"Invalid enum value '{value}' for {action_type}.{field}; "
                f"expected one of {field_def['values']}"
            )
        elif field_def["type"] == "number" and not isinstance(value, (int, float)):
            errors.append(f"Expected number for {action_type}.{field}, got {type(value).__name__}")
        elif field_def["type"] == "string" and not isinstance(value, str):
            errors.append(f"Expected string for {action_type}.{field}, got {type(value).__name__}")
        elif field_def["type"] == "array" and not isinstance(value, list):
            errors.append(f"Expected array for {action_type}.{field}, got {type(value).__name__}")

    return errors
