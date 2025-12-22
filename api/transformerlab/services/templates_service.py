"""
Templates service that uses the filesystem instead of the database.
This replaces the database-based template operations with filesystem-based ones.
"""

import uuid
from typing import List, Dict, Any, Optional
from lab.template import Template as TemplateService


class TemplatesService:
    """Service for managing templates using filesystem storage"""

    def __init__(self):
        self.template_service = TemplateService

    def templates_get_all(self) -> List[Dict[str, Any]]:
        """Get all templates from filesystem"""
        return self.template_service.list_all()

    def templates_get_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific template by ID"""
        return self.template_service.get_by_id(template_id)

    def templates_get_by_type(self, template_type: str) -> List[Dict[str, Any]]:
        """Get all templates of a specific type"""
        return self.template_service.list_by_type(template_type)

    def templates_get_by_experiment(self, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all templates for a specific experiment"""
        return self.template_service.list_by_experiment(experiment_id)

    def templates_get_by_type_in_experiment(self, template_type: str, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all templates of a specific type in a specific experiment"""
        return self.template_service.list_by_type_in_experiment(template_type, experiment_id)

    def templates_get_by_subtype_in_experiment(
        self, experiment_id: str, subtype: str, template_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all templates for a specific experiment filtered by subtype and optionally by type"""
        return self.template_service.list_by_subtype_in_experiment(experiment_id, subtype, template_type)

    def add_template(self, template_data: Dict[str, Any]) -> str:
        """Create a new template - all fields stored directly in JSON"""
        # Generate a unique ID for the template
        template_id = str(uuid.uuid4())

        try:
            template = self.template_service.create(template_id)
            # Store all fields directly (not nested)
            template.set_metadata(**template_data)
            return template_id
        except FileExistsError:
            # If template already exists, generate a new ID
            template_id = str(uuid.uuid4())
            template = self.template_service.create(template_id)
            template.set_metadata(**template_data)
            return template_id

    def update_template(self, template_id: str, new_template_data: Dict[str, Any]) -> bool:
        """Update an existing template"""
        try:
            template = self.template_service.get(str(template_id))

            # Update only the fields that are provided
            update_data = {}
            for key, value in new_template_data.items():
                if value is not None:
                    update_data[key] = value

            if update_data:
                template.set_metadata(**update_data)
            return True
        except FileNotFoundError:
            return False

    def delete_template(self, template_id: str) -> bool:
        """Delete a template"""
        try:
            template = self.template_service.get(str(template_id))
            template.delete()
            return True
        except FileNotFoundError:
            return False

    def templates_delete_all(self) -> None:
        """Delete all templates"""
        self.template_service.delete_all()


# Create a singleton instance
templates_service = TemplatesService()
