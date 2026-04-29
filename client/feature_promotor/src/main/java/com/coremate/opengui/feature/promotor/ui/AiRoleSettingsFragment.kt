package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Spinner
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentAiRoleSettingsBinding

class AiRoleSettingsFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentAiRoleSettingsBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        _binding = FragmentAiRoleSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)


        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack()
        }


        setupSpinner(binding.spinnerGender, R.array.ai_role_genders) { position ->
            val selectedGender = resources.getStringArray(R.array.ai_role_genders)[position]
            Toast.makeText(requireContext(), "Selected gender: $selectedGender", Toast.LENGTH_SHORT).show()

        }

        setupSpinner(binding.spinnerStyle, R.array.ai_role_styles) { position ->
            val selectedStyle = resources.getStringArray(R.array.ai_role_styles)[position]
            Toast.makeText(requireContext(), "Selected style: $selectedStyle", Toast.LENGTH_SHORT).show()
        }

        setupSpinner(binding.spinnerIndustry, R.array.ai_role_industries) { position ->
            val selectedIndustry = resources.getStringArray(R.array.ai_role_industries)[position]
            Toast.makeText(requireContext(), "Selected industry: $selectedIndustry", Toast.LENGTH_SHORT).show()
        }


        binding.etKnowledgeBase.setOnClickListener {
            navigateToKnowledgeBaseSelection()
        }


        binding.btnSaveSettings.setOnClickListener {
            saveAiRoleSettings()
        }


        loadAiRoleSettings()
    }

    private fun setupSpinner(spinner: Spinner, arrayResId: Int, onItemSelected: (Int) -> Unit) {
        val adapter = ArrayAdapter.createFromResource(
            requireContext(),
            arrayResId,
            android.R.layout.simple_spinner_item
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: View?, position: Int, id: Long) {
                onItemSelected(position)
            }
            override fun onNothingSelected(parent: AdapterView<*>) {
                // Do nothing
            }
        }
    }

    private fun loadAiRoleSettings() {


        binding.etRoleName.setText("Support Agent 1")
        binding.etPhoneNumber.setText("15874746969")
        binding.etKnowledgeBase.setText("Beauty Life medical aesthetics knowledge base")



        val genderArray = resources.getStringArray(R.array.ai_role_genders)
        val genderIndex = genderArray.indexOf("Male") // Assumes "Male" exists in the array.
        if (genderIndex != -1) {
            binding.spinnerGender.setSelection(genderIndex)
        }


        val styleArray = resources.getStringArray(R.array.ai_role_styles)
        val styleIndex = styleArray.indexOf("Confident, humorous, empathetic")
        if (styleIndex != -1) {
            binding.spinnerStyle.setSelection(styleIndex)
        }


        val industryArray = resources.getStringArray(R.array.ai_role_industries)
        val industryIndex = industryArray.indexOf("Medical aesthetics")
        if (industryIndex != -1) {
            binding.spinnerIndustry.setSelection(industryIndex)
        }
    }

    private fun saveAiRoleSettings() {
        val roleName = binding.etRoleName.text.toString()
        val gender = binding.spinnerGender.selectedItem.toString()
        val style = binding.spinnerStyle.selectedItem.toString()
        val phoneNumber = binding.etPhoneNumber.text.toString()
        val industry = binding.spinnerIndustry.selectedItem.toString()
        val knowledgeBase = binding.etKnowledgeBase.text.toString()



        if (roleName.isBlank()) {
            Toast.makeText(requireContext(), "Role name cannot be empty", Toast.LENGTH_SHORT).show()
            return
        }
        if (phoneNumber.isBlank() || !isValidPhoneNumber(phoneNumber)) {
            Toast.makeText(requireContext(), "Enter a valid phone number", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(requireContext(), "Saved successfully! Role name: $roleName, Phone number: $phoneNumber", Toast.LENGTH_LONG).show()

        // parentFragmentManager.popBackStack()
    }

    private fun isValidPhoneNumber(phoneNumber: String): Boolean {

        return phoneNumber.length == 11 && phoneNumber.startsWith("1") && phoneNumber.all { it.isDigit() }
    }

    private fun navigateToKnowledgeBaseSelection() {
        if (containerId != 0) {
            parentFragmentManager.beginTransaction()
                .replace(containerId, KnowledgeBaseSelectionFragment(containerId))
                .addToBackStack(null)
                .commit()
        } else {
            Toast.makeText(requireContext(), "Navigation failed: container ID is not set.", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
